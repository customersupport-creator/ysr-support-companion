import { SUPPORT_LINE_DISPLAY } from "../shared/constants";
import type { AppSnapshot, PublicSettings, SendResult, SettingsPatch, YsrApi } from "../shared/types";
import { toE164 } from "../core/format";
import { createLocalDrafter } from "../core/localDrafter";
import { DeskSession } from "../core/session";
import { renotifyIntervalMs } from "../core/urgency";
import { DEMO_CONSENT, DEMO_FACILITIES, buildDemoMessages, simulatedInbound } from "../demo/fixtures";
import { PLAYBOOK_SOPS } from "../demo/playbookSops";

/** In-browser stand-in so the desk can be tried without Electron. Sends nothing. */
export function createBrowserDemo(): YsrApi {
  const session = new DeskSession({
    drafter: createLocalDrafter(),
    sops: PLAYBOOK_SOPS,
    facilities: DEMO_FACILITIES,
    consent: [...DEMO_CONSENT],
    agentName: "Maya",
    signature: "- Maya, YSR",
  });
  session.setMessages(buildDemoMessages(new Date()));

  let available = true;
  let alwaysOnTop = false;
  let banner: string | null = "Demo mode. Nothing is sent to a customer.";
  let bootstrapped = false;
  const seen = new Set<string>();
  const lastToast = new Map<string, number>();
  const listeners = new Set<(snapshot: AppSnapshot) => void>();

  const settings = (): PublicSettings => ({
    demoMode: true,
    rcServer: "production",
    rcClientId: "",
    hasRcSecret: false,
    hasRcJwt: false,
    rcLoggedIn: false,
    airtableTokenSet: false,
    correctionsOptIn: false,
    correctionsTableReady: false,
    llmProvider: "anthropic",
    llmModel: "claude-sonnet-4-5",
    llmKeySet: false,
    agentName: "Maya",
    signature: "- Maya, YSR",
    notificationsEnabled: true,
    alwaysOnTop,
    available,
    consentPhones: DEMO_CONSENT,
    secureStorage: false,
  });

  const snapshot = (): AppSnapshot => ({
    settings: settings(),
    connection: {
      mode: "demo",
      ringcentral: "demo",
      ringcentralDetail: `Demo data for support line ${SUPPORT_LINE_DISPLAY}.`,
      subscription: "off",
      airtable: "demo",
      airtableDetail: "Bundled playbook SOPs and sample facilities.",
      llm: "demo",
      llmDetail: "Local playbook drafter. Add a key in the desktop app to use Claude or OpenAI.",
    },
    queue: session.queue(),
    flagged: session.flagged(),
    selectedThreadId: session.selectedId,
    thread: session.threadView(),
    learning: session.learning(),
    outbox: session.getOutbox(),
    banner,
  });

  const emit = () => {
    noteQueue();
    for (const listener of listeners) listener(snapshot());
  };

  function noteQueue(): void {
    const queue = session.queue().filter((card) => !card.skipped);
    if (!bootstrapped) {
      for (const card of queue) {
        seen.add(card.key);
        lastToast.set(card.key, Date.now());
      }
      bootstrapped = true;
      return;
    }
    if (!available) return;
    const now = Date.now();
    for (const card of queue) {
      const interval = renotifyIntervalMs(card.urgency);
      const known = seen.has(card.key);
      if (!known || (interval != null && now - (lastToast.get(card.key) ?? 0) >= interval)) {
        banner = known ? `Still waiting. ${card.headline}` : card.headline;
        seen.add(card.key);
        lastToast.set(card.key, now);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(card.headline, { body: card.preview });
        }
      }
    }
  }

  session.subscribe(emit);
  noteQueue();

  const desktopOnly = (feature: string): SendResult => ({
    ok: false,
    message: `${feature} runs in the installed Windows app, where secrets stay in Windows secure storage.`,
  });

  return {
    getSnapshot: async () => snapshot(),
    onSnapshot: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setAvailable: async (value) => {
      available = value;
      if (value) banner = "You are available. New texts will notify you.";
      emit();
    },
    setAlwaysOnTop: async (value) => {
      alwaysOnTop = value;
      emit();
    },
    selectThread: async (threadId) => {
      await session.select(threadId);
    },
    runCommand: async (threadId, command) => session.runCommand(threadId, command),
    confirmSend: async (threadId, text) => {
      try {
        const payload = session.previewSend(threadId, text);
        session.commitSent(threadId, payload.text, `browser-${Date.now()}`, true);
        banner = `Demo only. Nothing was sent to ${toE164(payload.to)}.`;
        emit();
        return { ok: true, message: banner };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Not sent." };
      }
    },
    saveSettings: async (patch: SettingsPatch) => {
      if (patch.alwaysOnTop != null) alwaysOnTop = patch.alwaysOnTop;
      banner = "Browser demo keeps settings in this tab only.";
      emit();
      return { ok: true, message: banner };
    },
    testRingCentral: async () => desktopOnly("RingCentral login"),
    testAirtable: async () => desktopOnly("Airtable"),
    startOAuth: async () => desktopOnly("OAuth"),
    disconnectRingCentral: async () => ({ ok: true, message: "Demo mode is not signed in." }),
    createCorrectionsTable: async () => desktopOnly("Creating AGENT_CORRECTIONS"),
    simulateInbound: async () => {
      session.upsertMessages([simulatedInbound(new Date())]);
      return { ok: true, message: "Simulated a new customer text." };
    },
    getPanelHint: async () => ["queue", "thread", "learning", "settings"],
  };
}
