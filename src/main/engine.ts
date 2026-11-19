import fs from "fs";
import path from "path";
import { BrowserWindow, Notification } from "electron";
import {
  PANEL_IDS,
  RC_SERVERS,
  RECONCILE_INTERVAL_MS,
  RENOTIFY_TICK_MS,
  SOP_REFRESH_INTERVAL_MS,
} from "../shared/constants";
import type {
  AppSnapshot,
  CommandResult,
  ConnectionState,
  Correction,
  SendResult,
  SettingsPatch,
  SmsMessage,
} from "../shared/types";
import { renotifyIntervalMs } from "../core/urgency";
import { toE164 } from "../core/format";
import { isStopKeyword } from "../core/safety";
import { DeskSession } from "../core/session";
import type { Drafter } from "../core/draftTypes";
import { createLocalDrafter } from "../core/localDrafter";
import { DEMO_CONSENT, DEMO_FACILITIES, buildDemoMessages, simulatedInbound } from "../demo/fixtures";
import { PLAYBOOK_SOPS } from "../demo/playbookSops";
import { AirtableClient } from "../services/airtable/client";
import { createLlmDrafter } from "../services/llm/draftWithLlm";
import { RingCentralClient } from "../services/ringcentral/client";
import { RcEventStream } from "../services/ringcentral/subscription";
import { loginWithOAuth } from "./oauth";
import { loadPlaybookText } from "./playbook";
import { SettingsStore } from "./settingsStore";

export class DeskEngine {
  private readonly session: DeskSession;
  private readonly windows = new Set<BrowserWindow>();
  private rc: RingCentralClient | null = null;
  private stream: RcEventStream | null = null;
  private airtable: AirtableClient | null = null;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private renotifyTimer: ReturnType<typeof setInterval> | null = null;
  private syncToken: string | null = null;
  private bootstrapped = false;
  private seenKeys = new Set<string>();
  private seenFlags = new Set<string>();
  private lastToast = new Map<string, number>();
  private sending = new Set<string>();
  private showWindow: () => void = () => undefined;
  private banner: string | null = null;
  private rcDetail = "Demo mode is on.";
  private rcState: ConnectionState["ringcentral"] = "demo";
  private subState: ConnectionState["subscription"] = "off";
  private airtableDetail = "Demo facilities and SOPs.";
  private airtableState: ConnectionState["airtable"] = "demo";
  private llmDetail = "Local playbook drafter.";
  private correctionsReady = false;
  private loggedIn = false;
  private suppressNotify = true;

  constructor(private readonly store: SettingsStore) {
    this.session = new DeskSession({
      drafter: { draft: (input) => this.draft(input) },
      agentName: store.agentName,
      signature: store.signature,
      sops: PLAYBOOK_SOPS,
      facilities: DEMO_FACILITIES,
      consent: this.currentConsent(),
      corrections: this.loadCorrections(),
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
    this.renotifyTimer = setInterval(() => this.noteQueue(), RENOTIFY_TICK_MS);
    this.broadcast();
  }

  stop(): void {
    this.stopLive();
    if (this.renotifyTimer) clearInterval(this.renotifyTimer);
    this.saveCorrections();
  }

  snapshot(): AppSnapshot {
    const llmReady = Boolean(this.store.secrets.llmApiKey);
    return {
      settings: this.store.toPublic(this.loggedIn, this.correctionsReady),
      connection: {
        mode: this.store.demoMode ? "demo" : "live",
        ringcentral: this.store.demoMode ? "demo" : this.rcState,
        ringcentralDetail: this.rcDetail,
        subscription: this.store.demoMode ? "off" : this.subState,
        airtable: this.store.demoMode ? "demo" : this.airtableState,
        airtableDetail: this.airtableDetail,
        llm: this.store.demoMode ? "demo" : llmReady ? "ready" : "off",
        llmDetail: this.store.demoMode ? "Demo uses the local playbook drafter." : this.llmDetail,
      },
      queue: this.session.queue(),
      flagged: this.session.flagged(),
      selectedThreadId: this.session.selectedId,
      thread: this.session.threadView(),
      learning: this.session.learning(),
      outbox: this.session.getOutbox(),
      banner: this.banner,
    };
  }

  async setAvailable(value: boolean): Promise<void> {
    const was = this.store.available;
    this.store.available = value;
    if (value && !was) this.announceBacklog();
    this.broadcast();
  }

  async selectThread(threadId: string | null): Promise<void> {
    await this.session.select(threadId);
  }

  async runCommand(threadId: string, command: string): Promise<CommandResult> {
    const result = await this.session.runCommand(threadId, command);
    this.saveCorrections();
    await this.flushCorrections();
    this.broadcast();
    return result;
  }

  async confirmSend(threadId: string, text: string): Promise<SendResult> {
    if (this.sending.has(threadId)) return { ok: false, message: "A send is already in progress." };
    let payload: { to: string; text: string };
    try {
      payload = this.session.previewSend(threadId, text);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Not approved." };
    }
    this.sending.add(threadId);
    try {
      if (this.store.demoMode) {
        this.session.commitSent(threadId, payload.text, `demo-${Date.now()}`, true);
        this.banner = "Demo send recorded on this computer. Nothing was sent to the customer.";
        return { ok: true, message: this.banner };
      }
      if (!this.rc || !this.loggedIn) return { ok: false, message: "RingCentral is not connected." };
      const sent = await this.rc.sendSms(payload.to, payload.text);
      this.session.commitSent(threadId, payload.text, sent.id, false);
      this.banner = "Sent.";
      return { ok: true, message: "Sent." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed.";
      this.banner = message;
      return { ok: false, message };
    } finally {
      this.sending.delete(threadId);
      this.broadcast();
    }
  }

  async saveSettings(patch: SettingsPatch): Promise<SendResult> {
    const modeChanged = patch.demoMode != null && patch.demoMode !== this.store.demoMode;
    const result = this.store.update(patch);
    this.session.setAgent(this.store.agentName, this.store.signature);
    if (patch.alwaysOnTop != null) {
      for (const win of this.windows) win.setAlwaysOnTop(patch.alwaysOnTop);
    }
    if (patch.airtableToken || patch.clearAirtableToken) this.airtable = null;
    if (patch.consentPhones || modeChanged) this.session.setConsent(this.currentConsent());
    if (modeChanged || patch.rcJwt || patch.rcClientSecret || patch.airtableToken || patch.llmApiKey) {
      await this.applyMode();
    }
    this.broadcast();
    return result;
  }

  async testRingCentral(): Promise<SendResult> {
    try {
      await this.ensureClient(true);
      this.rcState = "connected";
      this.rcDetail = "Signed in.";
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

  async testAirtable(): Promise<SendResult> {
    try {
      const client = this.airtableClient();
      const sops = await client.listSops();
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

  async startOAuth(): Promise<SendResult> {
    try {
      const client = await this.ensureClient(false);
      await loginWithOAuth(client, this.store.rcClientId, RC_SERVERS[this.store.rcServer]);
      const tokens = client.getTokens();
      if (tokens) this.store.rememberTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresAt);
      this.loggedIn = true;
      this.rcState = "connected";
      this.rcDetail = "Signed in with OAuth.";
      if (!this.store.demoMode) await this.applyMode();
      this.broadcast();
      return { ok: true, message: "Signed in to RingCentral." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "OAuth failed.";
      return { ok: false, message };
    }
  }

  async disconnectRingCentral(): Promise<SendResult> {
    this.store.clearTokens();
    this.loggedIn = false;
    this.stopLive();
    this.rcDetail = "Signed out.";
    this.rcState = "disconnected";
    this.broadcast();
    return { ok: true, message: "Signed out." };
  }

  async createCorrectionsTable(): Promise<SendResult> {
    if (!this.store.correctionsOptIn) {
      return { ok: false, message: "Turn on the opt-in first. This app will not create a table unless you ask it to." };
    }
    try {
      const client = this.airtableClient();
      const id = await client.createCorrectionsTable();
      this.store.correctionsTableId = id;
      this.correctionsReady = true;
      this.banner = "AGENT_CORRECTIONS is ready. Existing tables were not changed.";
      this.broadcast();
      return { ok: true, message: this.banner };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the table.";
      return { ok: false, message };
    }
  }

  async simulateInbound(): Promise<SendResult> {
    if (!this.store.demoMode) return { ok: false, message: "Simulate is only available in demo mode." };
    this.ingest([simulatedInbound(new Date())]);
    return { ok: true, message: "Simulated a new customer text." };
  }

  private async applyMode(): Promise<void> {
    this.stopLive();
    this.bootstrapped = false;
    this.seenKeys.clear();
    this.seenFlags.clear();
    this.suppressNotify = true;
    this.session.setAgent(this.store.agentName, this.store.signature);
    this.session.setConsent(this.currentConsent());
    if (this.store.demoMode) {
      this.session.setSops(PLAYBOOK_SOPS);
      this.session.setFacilities(DEMO_FACILITIES);
      this.session.setMessages(buildDemoMessages(new Date()));
      this.rcState = "demo";
      this.rcDetail = "Demo mode is on. No credentials are used.";
      this.airtableState = "demo";
      this.airtableDetail = "Using the bundled playbook SOPs and two sample facilities.";
      this.subState = "off";
      this.loggedIn = false;
      this.llmDetail = "Local playbook drafter.";
      this.finishLoad();
      return;
    }
    this.session.setSops(PLAYBOOK_SOPS);
    this.session.setFacilities([]);
    this.session.setMessages([]);
    this.llmDetail = this.store.secrets.llmApiKey
      ? `${this.store.llmProvider} · ${this.store.llmModel}`
      : "No LLM key. Drafts use the local playbook drafter.";
    try {
      await this.ensureClient(true);
      this.loggedIn = true;
      this.rcState = "connected";
      this.rcDetail = "Signed in.";
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
    this.bootstrapped = false;
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
        if (status !== "live") this.rcDetail = detail;
        else this.rcDetail = "Signed in. Listening for SMS.";
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
      this.airtableDetail = "No Airtable token. Using the bundled playbook until you add one.";
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
      if (this.store.correctionsOptIn) {
        const found = await client.inspectCorrectionsTable();
        this.correctionsReady = Boolean(found && found.missingFields.length === 0);
        if (found?.id && this.correctionsReady) this.store.correctionsTableId = found.id;
        if (found && found.missingFields.length > 0) {
          this.airtableDetail += ` AGENT_CORRECTIONS is missing ${found.missingFields.join(", ")}. It was not modified.`;
        }
      }
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

  private async draft(input: Parameters<Drafter["draft"]>[0]) {
    const local = createLocalDrafter();
    if (this.store.demoMode || !this.store.secrets.llmApiKey) return local.draft(input);
    try {
      const llm = createLlmDrafter({
        provider: this.store.llmProvider,
        apiKey: this.store.secrets.llmApiKey,
        model: this.store.llmModel,
        playbook: loadPlaybookText(),
      });
      return await llm.draft(input);
    } catch (error) {
      const fallback = await local.draft(input);
      const reason = error instanceof Error ? error.message : "LLM failed.";
      fallback.agentQuestion = `${reason} Showing a local playbook draft. ${fallback.agentQuestion}`.trim();
      return fallback;
    }
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
      else if (!this.store.secrets.rcAccessToken) {
        throw new Error("Add a JWT or use OAuth login.");
      }
      const tokens = client.getTokens();
      if (tokens) this.store.rememberTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresAt);
    }
    this.rc = client;
    return client;
  }

  private airtableClient(): AirtableClient {
    if (!this.store.secrets.airtableToken) throw new Error("Add an Airtable personal access token in Settings.");
    if (!this.airtable) this.airtable = new AirtableClient(this.store.secrets.airtableToken);
    if (this.store.correctionsTableId) this.airtable.setCorrectionsTableId(this.store.correctionsTableId);
    return this.airtable;
  }

  private async flushCorrections(): Promise<void> {
    if (this.store.demoMode || !this.store.correctionsOptIn || !this.correctionsReady) return;
    try {
      const client = this.airtableClient();
      for (const item of this.session.getCorrections()) {
        if (item.synced) continue;
        await client.addCorrection(item);
        this.session.markCorrectionSynced(item.id);
      }
      this.saveCorrections();
    } catch (error) {
      this.banner = error instanceof Error ? error.message : "Could not sync a correction.";
    }
  }

  private noteQueue(): void {
    if (this.suppressNotify) return;
    const queue = this.session.queue().filter((card) => !card.skipped);
    const flags = this.session.flagged();
    if (!this.bootstrapped) {
      for (const card of queue) {
        this.seenKeys.add(card.key);
        this.lastToast.set(card.key, Date.now());
      }
      for (const flag of flags) this.seenFlags.add(flag.threadId);
      this.bootstrapped = true;
      return;
    }
    if (!this.store.available || !this.store.notificationsEnabled) return;
    const now = Date.now();
    for (const card of queue) {
      const interval = renotifyIntervalMs(card.urgency);
      const seen = this.seenKeys.has(card.key);
      const last = this.lastToast.get(card.key) ?? 0;
      if (!seen || (interval != null && now - last >= interval)) {
        this.toast(card.headline, seen ? `Still waiting ${card.preview}` : card.preview);
        this.seenKeys.add(card.key);
        this.lastToast.set(card.key, now);
      }
    }
    for (const flag of flags) {
      if (this.seenFlags.has(flag.threadId)) continue;
      this.seenFlags.add(flag.threadId);
      this.toast("Do not text", flag.headline);
    }
  }

  private announceBacklog(): void {
    const unseen = this.session.queue().filter((card) => !card.skipped && !this.seenKeys.has(card.key));
    if (unseen.length === 1) this.toast(unseen[0].headline, unseen[0].preview);
    else if (unseen.length > 1) this.toast("YSR Desk", `${unseen.length} customers need a reply.`);
    const now = Date.now();
    for (const card of this.session.queue()) {
      this.seenKeys.add(card.key);
      this.lastToast.set(card.key, now);
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

  private loadCorrections(): Correction[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.store.correctionsPath, "utf8")) as Correction[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveCorrections(): void {
    fs.mkdirSync(path.dirname(this.store.correctionsPath), { recursive: true });
    fs.writeFileSync(this.store.correctionsPath, JSON.stringify(this.session.getCorrections(), null, 2), "utf8");
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
