import { SUPPORT_LINE_DISPLAY } from "../shared/constants";
import type { AppSnapshot, PublicSettings, ActionResult, SettingsPatch, YsrApi } from "../shared/types";
import { shouldAlertForWait } from "../core/alerts";
import { toE164 } from "../core/format";
import { RINGCENTRAL_WEB_SMS, ringCentralSmsUrl } from "../core/ringcentralLink";
import { DeskSession } from "../core/session";
import { DEMO_CONSENT, DEMO_FACILITIES, buildDemoMessages, simulatedInbound } from "../demo/fixtures";
import { PLAYBOOK_SOPS } from "../demo/playbookSops";

/** In-browser stand-in so the desk can be tried without Electron. */
export function createBrowserDemo(): YsrApi {
  const session = new DeskSession({
    sops: PLAYBOOK_SOPS,
    facilities: DEMO_FACILITIES,
    consent: [...DEMO_CONSENT],
  });
  session.setMessages(buildDemoMessages(new Date()));

  let available = true;
  let alwaysOnTop = false;
  let notificationsEnabled = true;
  let openNumbersIn: "desktop" | "web" = "desktop";
  let banner: string | null = "Demo mode. This desk does not send texts.";
  const alerted = new Set<string>();
  const listeners = new Set<(snapshot: AppSnapshot) => void>();

  const settings = (): PublicSettings => ({
    demoMode: true,
    rcServer: "production",
    rcClientId: "",
    hasRcSecret: false,
    hasRcJwt: false,
    rcLoggedIn: false,
    airtableTokenSet: false,
    notificationsEnabled,
    alwaysOnTop,
    available,
    openNumbersIn,
    consentPhones: DEMO_CONSENT,
    secureStorage: false,
  });

  const snapshot = (): AppSnapshot => ({
    settings: settings(),
    connection: {
      mode: "demo",
      ringcentral: "demo",
      ringcentralDetail: `Demo data for support line ${SUPPORT_LINE_DISPLAY}. Nothing is sent.`,
      subscription: "off",
      airtable: "demo",
      airtableDetail: "Bundled SOP list and sample facilities.",
    },
    queue: session.queue(),
    flagged: session.flagged(),
    selectedThreadId: session.selectedId,
    thread: session.threadView(),
    resolvedToday: session.resolvedToday(),
    banner,
  });

  const emit = () => {
    noteQueue();
    for (const listener of listeners) listener(snapshot());
  };

  function noteQueue(): void {
    const waiting = new Set(session.queue().map((card) => card.customerPhone));
    for (const phone of alerted) {
      if (!waiting.has(phone)) alerted.delete(phone);
    }
    if (!available || !notificationsEnabled) return;
    for (const card of session.queue()) {
      if (!shouldAlertForWait(card.waitMs) || alerted.has(card.customerPhone)) continue;
      alerted.add(card.customerPhone);
      banner = card.headline;
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(card.headline, { body: card.preview });
      }
    }
  }

  session.subscribe(emit);

  const desktopOnly = (feature: string): ActionResult => ({
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
      banner = value ? "You are available. A number waiting 5 minutes gets one alert." : "You are away. Alerts are paused.";
      emit();
    },
    setAlwaysOnTop: async (value) => {
      alwaysOnTop = value;
      emit();
    },
    selectThread: async (threadId) => {
      session.select(threadId);
    },
    resolveThread: async (threadId) => {
      const record = session.resolve(threadId);
      if (!record) return { ok: false, message: "That number is not waiting on a reply." };
      banner = "Resolved on this computer. Nothing was sent.";
      emit();
      return { ok: true, message: banner };
    },
    unresolvePhone: async (phone) => {
      session.unresolve(phone);
      banner = "Back in the queue.";
      emit();
      return { ok: true, message: banner };
    },
    openNumber: async (phone) => {
      if (openNumbersIn === "web") {
        try {
          await navigator.clipboard.writeText(toE164(phone));
        } catch {
          /* clipboard may be blocked in the browser demo */
        }
        window.open(RINGCENTRAL_WEB_SMS, "_blank", "noopener");
        banner = "Number copied, paste it in RingCentral search";
        emit();
        return { ok: true, message: banner };
      }
      const url = ringCentralSmsUrl(phone);
      banner = `Demo would open ${url}`;
      emit();
      return { ok: true, message: banner };
    },
    copyText: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return { ok: false, message: "Could not copy that." };
      }
      return { ok: true, message: "Copied." };
    },
    saveSettings: async (patch: SettingsPatch) => {
      if (patch.alwaysOnTop != null) alwaysOnTop = patch.alwaysOnTop;
      if (patch.notificationsEnabled != null) notificationsEnabled = patch.notificationsEnabled;
      if (patch.openNumbersIn === "desktop" || patch.openNumbersIn === "web") openNumbersIn = patch.openNumbersIn;
      banner = "Browser demo keeps settings in this tab only.";
      emit();
      return { ok: true, message: banner };
    },
    testRingCentral: async () => desktopOnly("RingCentral login"),
    testAirtable: async () => desktopOnly("Airtable"),
    startOAuth: async () => desktopOnly("OAuth"),
    disconnectRingCentral: async () => ({ ok: true, message: "Demo mode is not signed in." }),
    simulateInbound: async () => {
      const message = simulatedInbound(new Date());
      message.sentAt = new Date(Date.now() - 6 * 60_000).toISOString();
      session.upsertMessages([message]);
      return { ok: true, message: "Simulated a customer text that has been waiting 6 minutes." };
    },
    getPanelHint: async () => ["queue", "thread", "settings"],
  };
}
