import { BrowserWindow, Notification } from "electron";
import { ALERT_TICK_MS, PANEL_IDS, RC_SERVERS, RECONCILE_INTERVAL_MS, SOP_REFRESH_INTERVAL_MS } from "../shared/constants";
import type { ActionResult, AppSnapshot, SettingsPatch, SmsMessage } from "../shared/types";
import { shouldAlertForWait } from "../core/alerts";
import { toE164 } from "../core/format";
import { isStopKeyword } from "../core/safety";
import { DeskSession } from "../core/session";
import { DEMO_CONSENT, DEMO_FACILITIES, buildDemoMessages, simulatedInbound } from "../demo/fixtures";
import { PLAYBOOK_SOPS } from "../demo/playbookSops";
import { AirtableClient } from "../services/airtable/client";
import { RingCentralClient } from "../services/ringcentral/client";
import { RcEventStream } from "../services/ringcentral/subscription";
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
  private syncToken: string | null = null;
  private alertedPhones = new Set<string>();
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
  }

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win);
    win.on("closed", () => this.windows.delete(win));
  }

  setShowWindow(fn: () => void): void {
    this.showWindow = fn;
  }

  async start(): Promise<void> {
    await this.applyMode();
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
      thread: this.session.threadView(),
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

  async saveSettings(patch: SettingsPatch): Promise<ActionResult> {
    const modeChanged = patch.demoMode != null && patch.demoMode !== this.store.demoMode;
    const result = this.store.update(patch);
    if (patch.alwaysOnTop != null) {
      for (const win of this.windows) win.setAlwaysOnTop(patch.alwaysOnTop);
    }
    if (patch.airtableToken || patch.clearAirtableToken) this.airtable = null;
    if (patch.consentPhones || modeChanged) this.session.setConsent(this.currentConsent());
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

  async disconnectRingCentral(): Promise<ActionResult> {
    this.store.clearTokens();
    this.loggedIn = false;
    this.stopLive();
    this.rcDetail = "Signed out.";
    this.rcState = "disconnected";
    this.broadcast();
    return { ok: true, message: "Signed out." };
  }

  async simulateInbound(): Promise<ActionResult> {
    if (!this.store.demoMode) return { ok: false, message: "Simulate is only available in demo mode." };
    const message = simulatedInbound(new Date());
    message.sentAt = new Date(Date.now() - 6 * 60_000).toISOString();
    this.ingest([message]);
    return { ok: true, message: "Simulated a customer text that has been waiting 6 minutes." };
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
      await this.refreshReference();
      this.reconcileTimer = setInterval(() => void this.reconcile(), RECONCILE_INTERVAL_MS);
      this.refreshTimer = setInterval(() => void this.refreshReference(), SOP_REFRESH_INTERVAL_MS);
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
    this.reconcileTimer = null;
    this.refreshTimer = null;
    this.stream?.stop();
    this.stream = null;
    this.syncToken = null;
  }

  private async reconcile(): Promise<void> {
    if (!this.rc || this.store.demoMode) return;
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

  private async refreshReference(): Promise<void> {
    if (!this.store.secrets.airtableToken) {
      this.airtableState = "off";
      this.airtableDetail = "No Airtable token. Using the bundled SOP list until you add one.";
      this.session.setSops(PLAYBOOK_SOPS);
      return;
    }
    try {
      const client = this.airtableClient();
      const [sops, facilities] = await Promise.all([client.listSops(), client.listFacilities()]);
      this.session.setSops(sops.length ? sops : PLAYBOOK_SOPS);
      this.session.setFacilities(facilities);
      this.airtableState = "connected";
      this.airtableDetail = `${sops.length} SOPs, ${facilities.length} facilities. Read only.`;
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
        additions.push({ phone: message.threadId, reason: "Customer sent STOP. Do not text." });
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
    this.session.upsertMessages(messages);
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
        if (!shouldAlertForWait(card.waitMs) || this.alertedPhones.has(card.customerPhone)) continue;
        this.alertedPhones.add(card.customerPhone);
        this.toast(card.headline, card.preview);
      }
      for (const flag of this.session.flagged()) {
        if (this.seenFlags.has(flag.threadId)) continue;
        this.seenFlags.add(flag.threadId);
        this.toast("Do not text", flag.headline);
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

export function panelIds(): typeof PANEL_IDS {
  return PANEL_IDS;
}
