import fs from "fs";
import path from "path";
import { app, BrowserWindow, NativeImage, Notification, clipboard, nativeImage, shell } from "electron";
import { ACCESS_REFRESH_INTERVAL_MS, ALERT_TICK_MS, HISTORY_LOOKBACK_MS, PANEL_IDS, RC_SERVERS, RECONCILE_INTERVAL_MS, SOP_REFRESH_INTERVAL_MS, SUPPORT_LINE_E164 } from "../shared/constants";
import type { ActionResult, AppSnapshot, CustomerHistoryPage, FacilityListItem, FacilityRecord, HistoryMessage, SettingsPatch, SmsMessage, ThreadView } from "../shared/types";
import { shouldAlertForWait } from "../core/alerts";
import { attentionNotice, extractRentalIds } from "../core/rentalIds";
import { urgentTitle } from "../core/urgentBell";
import { toE164 } from "../core/format";
import { RINGCENTRAL_WEB_SMS, assertAllowedExternalUrl, beeTextingUrl, ringCentralSmsUrl } from "../core/ringcentralLink";
import { isStopKeyword } from "../core/safety";
import { DeskSession } from "../core/session";
import { DEMO_BOOKINGS, DEMO_CONSENT, DEMO_FACILITIES, buildDemoMessages, simulatedInbound } from "../demo/fixtures";
import { PLAYBOOK_SOPS } from "../demo/playbookSops";
import { AirtableClient } from "../services/airtable/client";
import { RingCentralClient } from "../services/ringcentral/client";
import { RcEventStream } from "../services/ringcentral/subscription";
import { GmailClient } from "../services/gmail/client";
import { gmailAccessToken, loginGmail } from "./gmailOauth";
import { loginWithOAuth } from "./oauth";
import { SettingsStore } from "./settingsStore";

export class DeskEngine {
  private readonly session: DeskSession;
  private readonly windows = new Set<BrowserWindow>();
  private rc: RingCentralClient | null = null;
  private stream: RcEventStream | null = null;
  private airtable: AirtableClient | null = null;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private alertTimer: ReturnType<typeof setInterval> | null = null;
  private accessTimer: ReturnType<typeof setInterval> | null = null;
  private historyCache = new Map<string, { at: number; page: CustomerHistoryPage }>();
  private syncToken: string | null = null;
  private alertedPhones = new Set<string>();
  private alertedUrgent = new Set<string>();
  private alertedFollowUps = new Set<string>();
  private alertedFacilities = new Set<string>();
  private seenFlags = new Set<string>();
  private suppressNotify = true;
  private showWindow: () => void = () => undefined;
  private banner: string | null = null;
  private rcDetail = "Demo mode is on.";
  private rcState: AppSnapshot["connection"]["ringcentral"] = "demo";
  private subState: AppSnapshot["connection"]["subscription"] = "off";
  private airtableDetail = "Demo facilities and SOPs.";
  private airtableState: AppSnapshot["connection"]["airtable"] = "demo";
  private loggedIn = false;

  constructor(private readonly store: SettingsStore) {
    this.session = new DeskSession({
      sops: PLAYBOOK_SOPS,
      facilities: DEMO_FACILITIES,
      consent: this.currentConsent(),
    });
    this.session.subscribe(() => {
      this.noteQueue();
      this.broadcast();
    });
    this.session.setResolved(this.store.loadResolved());
    this.session.setUrgentSeen(this.store.loadUrgentSeen());
  }

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win);
    win.on("closed", () => this.windows.delete(win));
  }

  setShowWindow(fn: () => void): void {
    this.showWindow = fn;
  }

  async start(): Promise<void> {
    this.restoreOps();
    await this.applyMode();
    this.syncOpsSettings();
    this.alertTimer = setInterval(() => this.noteQueue(), ALERT_TICK_MS);
    this.broadcast();
  }

  stop(): void {
    this.stopLive();
    if (this.alertTimer) clearInterval(this.alertTimer);
  }

  snapshot(): AppSnapshot {
    return {
      settings: this.store.toPublic(this.loggedIn),
      connection: {
        mode: this.store.demoMode ? "demo" : "live",
        ringcentral: this.store.demoMode ? "demo" : this.rcState,
        ringcentralDetail: this.rcDetail,
        subscription: this.store.demoMode ? "off" : this.subState,
        airtable: this.store.demoMode ? "demo" : this.airtableState,
        airtableDetail: this.airtableDetail,
      },
      queue: this.session.queue(),
      flagged: this.session.flagged(),
      selectedThreadId: this.session.selectedId,
      thread: hideFacilityNotes(this.session.threadView()),
      resolvedToday: this.session.resolvedToday(),
      urgentItems: this.session.urgentItems(),
      unseenUrgentCount: this.session.unseenUrgentCount(),
      facilities: this.session.listFacilities(),
      followUps: this.session.followUps(),
      commitments: this.session.commitments(),
      facilityAlerts: this.session.facilityAlerts(),
      facilityAlertHistory: this.session.facilityAlertHistory(),
      facilityIssueCounts: this.session.facilityIssueCounts(),
      banner: this.banner,
    };
  }

  async setAvailable(value: boolean): Promise<void> {
    this.store.available = value;
    this.noteQueue();
    this.broadcast();
  }

  async selectThread(threadId: string | null): Promise<void> {
    this.session.select(threadId);
  }

  async resolveThread(threadId: string): Promise<ActionResult> {
    const record = this.session.resolve(threadId);
    if (!record) return { ok: false, message: "That number is not waiting on a reply." };
    this.store.saveResolved(this.session.getResolved());
    this.alertedPhones.delete(record.phone);
    return { ok: true, message: `Resolved ${record.phone}` };
  }

  async markUrgentSeen(): Promise<void> {
    this.session.markUrgentSeen();
    this.store.saveUrgentSeen(this.session.getUrgentSeen());
    this.syncTaskbar();
  }

  async unresolvePhone(phone: string): Promise<ActionResult> {
    this.session.unresolve(phone);
    this.store.saveResolved(this.session.getResolved());
    this.alertedPhones.delete(toE164(phone));
    return { ok: true, message: "Back in the queue." };
  }

  /** Opens BeeTexting or RingCentral for this number. Never sends or prefills a message. */
  async openNumber(phone: string): Promise<ActionResult> {
    if (this.store.openNumbersIn === "beetexting") {
      try {
        const url = beeTextingUrl(this.store.beeTextingTemplate, phone);
        clipboard.writeText(toE164(phone));
        await shell.openExternal(url);
        const message = "Number copied, paste it in BeeTexting search";
        this.announce(message);
        return { ok: true, message };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not open BeeTexting.";
        this.announce(message);
        return { ok: false, message };
      }
    }
    if (this.store.openNumbersIn === "web") {
      const opened = await this.openInWeb(phone);
      this.announce(opened.message);
      return opened;
    }
    try {
      const url = ringCentralSmsUrl(phone);
      assertAllowedExternalUrl(url);
      await shell.openExternal(url);
      return { ok: true, message: "Opened in the RingCentral app." };
    } catch {
      const fallback = await this.openInWeb(phone);
      const message = `RingCentral app did not open. ${fallback.message}`;
      this.announce(message);
      return { ok: fallback.ok, message };
    }
  }

  private async openInWeb(phone: string): Promise<ActionResult> {
    assertAllowedExternalUrl(RINGCENTRAL_WEB_SMS);
    clipboard.writeText(toE164(phone));
    try {
      await shell.openExternal(RINGCENTRAL_WEB_SMS);
    } catch {
      return { ok: false, message: "Could not open RingCentral." };
    }
    return { ok: true, message: "Number copied, paste it in RingCentral search" };
  }

  private announce(message: string): void {
    this.banner = message;
    this.toast("YourSpotRented", message);
    this.broadcast();
  }

  async saveSettings(patch: SettingsPatch): Promise<ActionResult> {
    const modeChanged = patch.demoMode != null && patch.demoMode !== this.store.demoMode;
    const result = this.store.update(patch);
    if (patch.alwaysOnTop != null) {
      for (const win of this.windows) win.setAlwaysOnTop(patch.alwaysOnTop);
    }
    if (patch.airtableToken || patch.clearAirtableToken) this.airtable = null;
    if (patch.consentPhones || modeChanged) this.session.setConsent(this.currentConsent());
    this.session.setValueThresholds({ transientBookings: this.store.toPublic(this.loggedIn).transientHighValueOver });
    this.syncOpsSettings();
    if (modeChanged || patch.rcJwt || patch.rcClientSecret || patch.airtableToken) await this.applyMode();
    this.broadcast();
    return result;
  }

  async testRingCentral(): Promise<ActionResult> {
    try {
      await this.ensureClient(true);
      this.rcState = "connected";
      this.rcDetail = "Signed in. This app only reads messages.";
      this.loggedIn = true;
      this.broadcast();
      return { ok: true, message: "RingCentral accepted the credentials." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "RingCentral test failed.";
      this.rcState = "error";
      this.rcDetail = message;
      this.broadcast();
      return { ok: false, message };
    }
  }

  async testAirtable(): Promise<ActionResult> {
    try {
      const sops = await this.airtableClient().listSops();
      this.airtableState = "connected";
      this.airtableDetail = `Read ${sops.length} SOPs.`;
      if (!this.store.demoMode) this.session.setSops(sops.length ? sops : PLAYBOOK_SOPS);
      this.broadcast();
      return { ok: true, message: this.airtableDetail };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Airtable test failed.";
      this.airtableState = "error";
      this.airtableDetail = message;
      this.broadcast();
      return { ok: false, message };
    }
  }

  async startOAuth(): Promise<ActionResult> {
    try {
      const client = await this.ensureClient(false);
      await loginWithOAuth(client, this.store.rcClientId, RC_SERVERS[this.store.rcServer]);
      const tokens = client.getTokens();
      if (tokens) this.store.rememberTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresAt);
      this.loggedIn = true;
      this.rcState = "connected";
      this.rcDetail = "Signed in with OAuth. This app only reads messages.";
      if (!this.store.demoMode) await this.applyMode();
      this.broadcast();
      return { ok: true, message: "Signed in to RingCentral." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "OAuth failed." };
    }
  }

  async startGmailOAuth(): Promise<ActionResult> {
    try {
      if (!this.store.gmailClientId || !this.store.secrets.gmailClientSecret) {
        return { ok: false, message: "Add the Gmail client ID and client secret first. The scope is read-only." };
      }
      const refresh = await loginGmail(this.store.gmailClientId, this.store.secrets.gmailClientSecret);
      this.store.rememberGmail(refresh);
      if (!this.store.demoMode) await this.pullClicksend();
      this.broadcast();
      return { ok: true, message: "Gmail is connected for reading ClickSend replies. Nothing is sent." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Gmail connection failed." };
    }
  }

  async disconnectGmail(): Promise<ActionResult> {
    this.store.clearGmail();
    this.broadcast();
    return { ok: true, message: "Gmail was disconnected." };
  }

  async disconnectRingCentral(): Promise<ActionResult> {
    this.store.clearTokens();
    this.loggedIn = false;
    this.stopLive();
    this.rcDetail = "Signed out.";
    this.rcState = "disconnected";
    this.broadcast();
    return { ok: true, message: "Signed out." };
  }

  async refreshFacilities(): Promise<ActionResult> {
    if (this.store.demoMode) {
      this.session.setFacilities(DEMO_FACILITIES);
      this.session.setBookings(DEMO_BOOKINGS);
      this.broadcast();
      return { ok: true, message: "Demo facilities are loaded on this computer." };
    }
    if (!this.store.secrets.airtableToken) {
      return { ok: false, message: "Add an Airtable token to refresh facility codes." };
    }
    try {
      const facilities = await this.airtableClient().listFacilities();
      this.session.setFacilities(facilities);
      this.store.saveEncrypted("access-cache.json", this.session.listFacilities());
      this.airtableState = "connected";
      this.airtableDetail = `${facilities.length} facilities. Parsed codes are encrypted on this computer.`;
      this.broadcast();
      return { ok: true, message: `Refreshed ${facilities.length} facilities.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Facility refresh failed.";
      this.airtableState = "error";
      this.airtableDetail = message;
      this.broadcast();
      return { ok: false, message };
    }
  }

  setFacilityPick(phone: string, facilityId: string | null): void {
    this.session.setFacilityPick(phone, facilityId);
  }

  async loadHistory(phone: string, cursor?: string | null): Promise<CustomerHistoryPage> {
    const key = toE164(phone);
    if (this.store.demoMode) return this.demoHistory(key);
    const pageNumber = Number(cursor || "1") || 1;
    const cached = this.historyCache.get(key);
    if (pageNumber === 1 && cached && Date.now() - cached.at < ACCESS_REFRESH_INTERVAL_MS) return cached.page;
    const dateFrom = new Date(Date.now() - HISTORY_LOOKBACK_MS).toISOString();
    let messages: HistoryMessage[] = [];
    let nextCursor: string | null = null;
    if (this.rc) {
      const listed = await this.rc.listSmsForPhone(key, dateFrom, pageNumber);
      messages = listed.messages;
      nextCursor = listed.nextPage ? String(listed.nextPage) : null;
      this.ingest(messages.map((message) => historyToSms(key, message)));
    }
    if (pageNumber > 1 && cached) {
      messages = [...cached.page.messages, ...messages];
    }
    if (pageNumber === 1 && this.store.secrets.airtableToken) {
      const names = new Map(this.session.listFacilities().map((item) => [item.id, item.name]));
      const ids = extractRentalIds(this.session.messagesFor(key), key);
      await this.airtableClient().listCustomerBookings({
        phone: key,
        rentalIds: ids,
        monthlyTable: this.store.toPublic(this.loggedIn).historyMonthlyTable,
        leaseTable: this.store.toPublic(this.loggedIn).historyLeaseTable,
        transientTable: this.store.toPublic(this.loggedIn).historyTransientTable,
        facilityNames: names,
      }).then((rows) => this.session.addBookings(rows));
    }
    const page: CustomerHistoryPage = { phone: key, messages, nextCursor, bookings: this.session.bookingsFor(key) };
    this.historyCache.set(key, { at: Date.now(), page });
    this.store.saveEncrypted("history-cache.json", Object.fromEntries([...this.historyCache].map(([id, entry]) => [id, entry.page])));
    this.broadcast();
    return page;
  }

  private demoHistory(phone: string): CustomerHistoryPage {
    return {
      phone,
      messages: this.session.messagesFor(phone).map((message) => ({
        id: message.id,
        direction: message.direction,
        body: message.body,
        sentAt: message.sentAt,
        agentName: message.direction === "outbound" ? "Avery" : "",
      })),
      nextCursor: null,
      bookings: this.session.bookingsFor(phone),
    };
  }

  private restoreAccessCache(): void {
    const cached = this.store.loadEncrypted<FacilityListItem[]>("access-cache.json");
    if (!cached?.length) return;
    this.session.setFacilities(cached.map(facilityFromCache));
  }

  async simulateInbound(): Promise<ActionResult> {
    if (!this.store.demoMode) return { ok: false, message: "Simulate is only available in demo mode." };
    const message = simulatedInbound(new Date());
    message.sentAt = new Date(Date.now() - 6 * 60_000).toISOString();
    this.ingest([message]);
    return { ok: true, message: "Simulated a customer text that has been waiting 6 minutes." };
  }

  snoozeFollowUp(id: string, minutes: number): void {
    this.session.snoozeFollowUp(id, minutes);
    this.persistOps();
  }

  completeFollowUp(id: string): void {
    this.session.completeFollowUp(id);
    this.persistOps();
  }

  updateCommitment(id: string, status: "open" | "waiting" | "done", note: string): void {
    this.session.updateCommitment(id, status, note);
    this.persistOps();
  }

  dismissFacilityAlert(id: string): void {
    this.session.dismissFacilityAlert(id);
    this.persistOps();
  }

  commitmentCsv(): string {
    return this.session.commitmentCsv();
  }

  private restoreOps(): void {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "ops-state.json"), "utf8")) as ReturnType<
        DeskSession["opsState"]
      >;
      this.session.loadOps(parsed);
    } catch {
      this.session.loadOps({});
    }
  }

  private syncOpsSettings(): void {
    const settings = this.store.toPublic(this.loggedIn);
    this.session.setOpsSettings({
      followUpMinutes: settings.followUpMinutes,
      endorseFollowUpMinutes: settings.endorseFollowUpMinutes,
      facilityAlertCustomers: settings.facilityAlertCustomers,
      facilityAlertHours: settings.facilityAlertHours,
    });
  }

  private persistOps(): void {
    const state = this.session.opsState();
    const target = path.join(app.getPath("userData"), "ops-state.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(state), "utf8");
  }

  private async applyMode(): Promise<void> {
    this.stopLive();
    this.alertedPhones.clear();
    this.seenFlags.clear();
    this.suppressNotify = true;
    this.session.setConsent(this.currentConsent());
    if (this.store.demoMode) {
      this.session.setSops(PLAYBOOK_SOPS);
      this.session.setFacilities(DEMO_FACILITIES);
      this.session.setBookings(DEMO_BOOKINGS);
      this.session.setValueThresholds({ transientBookings: this.store.toPublic(false).transientHighValueOver });
      this.session.setMessages(buildDemoMessages(new Date()));
      this.rcState = "demo";
      this.rcDetail = "Demo mode is on. No credentials are used, and nothing is sent.";
      this.airtableState = "demo";
      this.airtableDetail = "Using the bundled SOP list and two sample facilities.";
      this.subState = "off";
      this.loggedIn = false;
      this.finishLoad();
      return;
    }
    this.session.setSops(PLAYBOOK_SOPS);
    this.session.setFacilities([]);
    this.session.setMessages([]);
    try {
      await this.ensureClient(true);
      this.loggedIn = true;
      this.rcState = "connected";
      this.rcDetail = "Signed in. Reading the message store.";
      const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const synced = await this.rc!.syncSms(null, since);
      this.syncToken = synced.syncToken;
      this.ingest(synced.messages);
      this.startStream();
      this.restoreAccessCache();
      await this.refreshReference();
      await this.refreshFacilities();
      this.reconcileTimer = setInterval(() => void this.reconcile(), RECONCILE_INTERVAL_MS);
      this.refreshTimer = setInterval(() => void this.refreshReference(), SOP_REFRESH_INTERVAL_MS);
      this.accessTimer = setInterval(() => void this.refreshFacilities(), ACCESS_REFRESH_INTERVAL_MS);
    } catch (error) {
      this.loggedIn = false;
      this.rcState = "error";
      this.rcDetail = error instanceof Error ? error.message : "RingCentral is not connected.";
    } finally {
      this.finishLoad();
    }
  }

  private finishLoad(): void {
    this.suppressNotify = false;
    this.noteQueue();
    this.broadcast();
  }

  private startStream(): void {
    if (!this.rc) return;
    this.stream = new RcEventStream(
      this.rc,
      (messages) => this.ingest(messages),
      (status, detail) => {
        this.subState = status;
        this.rcDetail = status === "live" ? "Signed in. Listening for SMS." : detail;
        this.broadcast();
      },
    );
    this.stream.start();
  }

  private stopLive(): void {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.accessTimer) clearInterval(this.accessTimer);
    this.reconcileTimer = null;
    this.refreshTimer = null;
    this.accessTimer = null;
    this.stream?.stop();
    this.stream = null;
    this.syncToken = null;
  }

  private async reconcile(): Promise<void> {
    if (this.store.demoMode) return;
    try {
      await this.pullClicksend();
    } catch {
      // ClickSend mail is optional. A Gmail failure does not stop RingCentral reads.
    }
    if (!this.rc) return;
    try {
      const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const synced = await this.rc.syncSms(this.syncToken, since);
      this.syncToken = synced.syncToken;
      if (synced.messages.length) this.ingest(synced.messages);
      if (this.airtable) {
        const extra = await this.airtable.listRecentMessages(1);
        if (extra.length) this.ingest(extra);
      }
    } catch (error) {
      this.rcDetail = error instanceof Error ? error.message : "Reconciliation failed.";
      this.broadcast();
    }
  }

  private async pullClicksend(): Promise<void> {
    if (this.store.demoMode || !this.store.gmailClientId || !this.store.secrets.gmailClientSecret || !this.store.secrets.gmailRefreshToken) {
      return;
    }
    try {
      const access = await gmailAccessToken(
        this.store.gmailClientId,
        this.store.secrets.gmailClientSecret,
        this.store.secrets.gmailRefreshToken,
      );
      const messages = await new GmailClient(access).listClicksendReplies();
      if (messages.length) this.ingest(messages);
    } catch {
      // Read-only poll. Leave the queue as it is when Gmail is briefly unavailable.
    }
  }

  private async refreshReference(): Promise<void> {
    if (!this.store.secrets.airtableToken) {
      this.airtableState = "off";
      this.airtableDetail = "No Airtable token. Using the bundled SOP list until you add one.";
      this.session.setSops(PLAYBOOK_SOPS);
      return;
    }
    try {
      const client = this.airtableClient();
      const sops = await client.listSops();
      this.session.setSops(sops.length ? sops : PLAYBOOK_SOPS);
      this.airtableState = "connected";
      this.airtableDetail = `${sops.length} SOPs. Read only.`;
      const extra = await client.listRecentMessages(2);
      if (extra.length) this.ingest(extra);
    } catch (error) {
      this.airtableState = "error";
      this.airtableDetail = error instanceof Error ? error.message : "Airtable read failed.";
      this.session.setSops(PLAYBOOK_SOPS);
    }
  }

  private ingest(messages: SmsMessage[]): void {
    const additions: Array<{ phone: string; reason: string }> = [];
    for (const message of messages) {
      if (message.direction === "inbound" && isStopKeyword(message.body)) {
        additions.push({ phone: message.threadId, reason: "Opted out — do not text" });
      }
    }
    if (additions.length) {
      const next = [...this.store.consentPhones];
      for (const addition of additions) {
        if (!next.some((item) => toE164(item.phone) === toE164(addition.phone))) next.push(addition);
      }
      this.store.update({ consentPhones: next });
      this.session.setConsent(this.currentConsent());
    }
    const waiting = new Map(this.session.queue().map((card) => [toE164(card.customerPhone), card.lastCustomerMessageId]));
    this.session.upsertMessages(messages);
    if (!this.store.autoResolveOnReply || this.suppressNotify) return;
    const resolved = this.session.autoResolveReplies(waiting);
    if (!resolved.length) return;
    this.store.saveResolved(this.session.getResolved());
    for (const record of resolved) {
      this.alertedPhones.delete(toE164(record.phone));
      for (const key of this.alertedUrgent) {
        if (key.startsWith(`${toE164(record.phone)}:`)) this.alertedUrgent.delete(key);
      }
    }
    this.syncTaskbar();
  }

  private async ensureClient(login: boolean): Promise<RingCentralClient> {
    if (!this.store.rcClientId || !this.store.secrets.rcClientSecret) {
      throw new Error("Add the RingCentral client ID and client secret in Settings.");
    }
    const client = new RingCentralClient({
      server: RC_SERVERS[this.store.rcServer],
      clientId: this.store.rcClientId,
      clientSecret: this.store.secrets.rcClientSecret,
    });
    if (this.store.secrets.rcAccessToken) {
      client.setTokens({
        accessToken: this.store.secrets.rcAccessToken,
        refreshToken: this.store.secrets.rcRefreshToken || undefined,
        expiresAt: this.store.secrets.rcAccessExpiresAt || Date.now() + 60_000,
      });
    }
    if (login) {
      if (this.store.secrets.rcJwt) await client.loginWithJwt(this.store.secrets.rcJwt);
      else if (!this.store.secrets.rcAccessToken) throw new Error("Add a JWT or use OAuth login.");
      const tokens = client.getTokens();
      if (tokens) this.store.rememberTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresAt);
    }
    this.rc = client;
    return client;
  }

  private airtableClient(): AirtableClient {
    if (!this.store.secrets.airtableToken) throw new Error("Add an Airtable personal access token in Settings.");
    this.airtable = new AirtableClient(this.store.secrets.airtableToken);
    return this.airtable;
  }

  /** One toast per phone number, and only after the customer has waited 5 minutes. */
  private noteQueue(): void {
    if (this.suppressNotify) return;
    const queue = this.session.queue();
    const waiting = new Set(queue.map((card) => card.customerPhone));
    for (const phone of this.alertedPhones) {
      if (!waiting.has(phone)) this.alertedPhones.delete(phone);
    }
    if (this.store.available && this.store.notificationsEnabled) {
      for (const card of queue) {
        if (card.urgent) continue;
        if (!shouldAlertForWait(card.waitMs) || this.alertedPhones.has(card.customerPhone)) continue;
        this.alertedPhones.add(card.customerPhone);
        this.toast(attentionNotice(card.customerPhone, card.rentalIds), card.preview);
      }
      for (const flag of this.session.flagged()) {
        if (this.seenFlags.has(flag.threadId)) continue;
        this.seenFlags.add(flag.threadId);
        this.toast("Do not text", flag.headline);
      }
    }
    if (this.store.available) {
      for (const card of queue) {
        if (!card.urgent) continue;
        const key = `${card.customerPhone}:${card.lastCustomerMessageId}`;
        if (this.alertedUrgent.has(key)) continue;
        this.alertedUrgent.add(key);
        const detail = card.rentalIds[0] ? `Rental ID ${card.rentalIds[0]}. ${card.preview}` : card.preview;
        this.toast(urgentTitle(card.displayPhone), detail);
        for (const win of this.windows) {
          if (win.isDestroyed()) continue;
          win.flashFrame(true);
          if (this.store.urgentSound) win.webContents.send("ysr:urgent-chime");
        }
      }
    }
    for (const key of this.alertedUrgent) {
      const splitAt = key.indexOf(":");
      const phone = key.slice(0, splitAt);
      const messageId = key.slice(splitAt + 1);
      if (!queue.some((card) => card.customerPhone === phone && card.lastCustomerMessageId === messageId)) {
        this.alertedUrgent.delete(key);
      }
    }
    this.syncTaskbar();
    this.noteOps();
  }

  private noteOps(): void {
    if (!this.store.available || !this.store.notificationsEnabled) return;
    for (const item of this.session.followUps()) {
      if (item.state !== "due" || this.alertedFollowUps.has(item.id)) continue;
      this.alertedFollowUps.add(item.id);
      this.toast("YourSpotRented", item.toast);
    }
    for (const alert of this.session.facilityAlerts()) {
      const signature = `${alert.id}:${alert.customers.map((customer) => customer.messageId).sort().join(",")}`;
      if (this.alertedFacilities.has(signature)) continue;
      this.alertedFacilities.add(signature);
      this.toast("YourSpotRented", alert.toast);
      if (alert.urgent) {
        for (const win of this.windows) {
          if (!win.isDestroyed()) win.flashFrame(true);
        }
      }
    }
  }

  private syncTaskbar(): void {
    const count = this.session.unseenUrgentCount() + this.session.facilityAlerts().filter((alert) => alert.urgent).length;
    for (const win of this.windows) {
      if (win.isDestroyed()) continue;
      try {
        if (count > 0) win.setOverlayIcon(urgentOverlay(), `${count} urgent`);
        else {
          win.setOverlayIcon(null, "");
          win.flashFrame(false);
        }
      } catch {
        // Overlay icons are a Windows taskbar feature.
      }
    }
  }

  private toast(title: string, body: string): void {
    if (!Notification.isSupported()) return;
    const notice = new Notification({ title, body });
    notice.on("click", () => this.showWindow());
    notice.show();
  }

  private currentConsent() {
    if (!this.store.demoMode) return this.store.consentPhones;
    const merged = [...DEMO_CONSENT];
    for (const item of this.store.consentPhones) {
      if (!merged.some((existing) => toE164(existing.phone) === toE164(item.phone))) merged.push(item);
    }
    return merged;
  }

  private broadcast(): void {
    const snapshot = this.snapshot();
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send("ysr:snapshot", snapshot);
    }
  }
}

function historyToSms(phone: string, message: HistoryMessage): SmsMessage {
  return {
    id: message.id,
    threadId: phone,
    direction: message.direction,
    body: message.body,
    sentAt: message.sentAt,
    fromPhone: message.direction === "outbound" ? SUPPORT_LINE_E164 : phone,
    toPhone: message.direction === "outbound" ? phone : SUPPORT_LINE_E164,
    source: "ringcentral",
  };
}

function hideFacilityNotes(view: ThreadView | null): ThreadView | null {
  if (!view?.facility) return view;
  return { ...view, facility: { ...view.facility, notes: "" } };
}

function facilityFromCache(item: FacilityListItem): FacilityRecord {
  return {
    id: item.id,
    name: item.name,
    address: item.address,
    facilityId: "",
    status: item.status,
    notes: "",
    gps: "",
    stallCount: null,
    stallsByPlatform: "",
    towingCompany: "",
    salesTowAuthorization: "",
    landlord: "",
    doNotTowPlates: "",
    doNotTowVehicles: "",
    contactPerson: "",
    phone: "",
    email: "",
    access: item.access,
  };
}

let overlayImage: NativeImage | null = null;

function urgentOverlay(): NativeImage {
  if (overlayImage) return overlayImage;
  const candidates = [
    path.join(process.resourcesPath, "urgent-overlay.png"),
    path.join(__dirname, "../../resources/urgent-overlay.png"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  overlayImage = found ? nativeImage.createFromPath(found) : nativeImage.createEmpty();
  return overlayImage;
}

export function panelIds(): typeof PANEL_IDS {
  return PANEL_IDS;
}
