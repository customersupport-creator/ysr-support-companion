import { SUPPORT_LINE_DISPLAY } from "../shared/constants";
import type { AppSnapshot, PublicSettings, ActionResult, SettingsPatch, YsrApi } from "../shared/types";
import { shouldAlertForWait } from "../core/alerts";
import { toE164 } from "../core/format";
import { BEETEXTING_HOME, RINGCENTRAL_WEB_SMS, beeTextingUrl, ringCentralSmsUrl } from "../core/ringcentralLink";
import { DeskSession } from "../core/session";
import { DEMO_BOOKINGS, DEMO_CONSENT, DEMO_FACILITIES, buildDemoMessages, simulatedInbound } from "../demo/fixtures";
import { PLAYBOOK_SOPS } from "../demo/playbookSops";

/** In-browser stand-in so the desk can be tried without Electron. */
export function createBrowserDemo(): YsrApi {
  const session = new DeskSession({
    sops: PLAYBOOK_SOPS,
    facilities: DEMO_FACILITIES,
    consent: [...DEMO_CONSENT],
  });
  session.setBookings(DEMO_BOOKINGS);
  session.setMessages(buildDemoMessages(new Date()));

  let available = true;
  let alwaysOnTop = false;
  let notificationsEnabled = true;
  let openNumbersIn: "beetexting" | "desktop" | "web" = "beetexting";
  let beeTextingTemplate = BEETEXTING_HOME;
  let urgentSound = true;
  let showAccessCodes = false;
  let transientHighValueOver = 15;
  let autoResolveOnReply = true;
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
    beeTextingTemplate,
    urgentSound,
    showAccessCodes,
    historyMonthlyTable: "MONTHLY",
    historyLeaseTable: "Internal lease",
    historyTransientTable: "TRANSIENT",
    transientHighValueOver,
    autoResolveOnReply,
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
    urgentItems: session.urgentItems(),
    unseenUrgentCount: session.unseenUrgentCount(),
    facilities: session.listFacilities(),
    banner,
  });

  const notify = () => {
    for (const listener of listeners) listener(snapshot());
  };

  const emit = () => {
    noteQueue();
    notify();
  };

  function noteQueue(): void {
    const waiting = new Set(session.queue().map((card) => card.customerPhone));
    for (const phone of alerted) {
      if (!waiting.has(phone)) alerted.delete(phone);
    }
    if (!available || !notificationsEnabled) return;
    for (const card of session.queue()) {
      if (card.urgent) continue;
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
    markUrgentSeen: async () => {
      session.markUrgentSeen();
      emit();
    },
    openNumber: async (phone) => {
      if (openNumbersIn === "beetexting") {
        const url = beeTextingUrl(beeTextingTemplate, phone);
        try {
          await navigator.clipboard.writeText(toE164(phone));
        } catch {
          /* clipboard may be blocked in the browser demo */
        }
        window.open(url, "_blank", "noopener");
        const message = "Number copied, paste it in BeeTexting search";
        emit();
        banner = message;
        notify();
        return { ok: true, message };
      }
      if (openNumbersIn === "web") {
        try {
          await navigator.clipboard.writeText(toE164(phone));
        } catch {
          /* clipboard may be blocked in the browser demo */
        }
        window.open(RINGCENTRAL_WEB_SMS, "_blank", "noopener");
        const message = "Number copied, paste it in RingCentral search";
        emit();
        banner = message;
        notify();
        return { ok: true, message };
      }
      const url = ringCentralSmsUrl(phone);
      const message = `Demo would open ${url}`;
      emit();
      banner = message;
      notify();
      return { ok: true, message };
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
      if (patch.beeTextingTemplate != null) {
        const next = patch.beeTextingTemplate.trim() || BEETEXTING_HOME;
        if (!next.startsWith("https://app.beetexting.com/")) {
          return { ok: false, message: "BeeTexting links must start with https://app.beetexting.com/" };
        }
      }
      if (patch.alwaysOnTop != null) alwaysOnTop = patch.alwaysOnTop;
      if (patch.notificationsEnabled != null) notificationsEnabled = patch.notificationsEnabled;
      if (patch.openNumbersIn === "desktop" || patch.openNumbersIn === "web" || patch.openNumbersIn === "beetexting") {
        openNumbersIn = patch.openNumbersIn;
      }
      if (patch.beeTextingTemplate != null) {
        beeTextingTemplate = patch.beeTextingTemplate.trim() || BEETEXTING_HOME;
      }
      if (patch.urgentSound != null) urgentSound = patch.urgentSound;
      if (patch.showAccessCodes != null) showAccessCodes = patch.showAccessCodes;
      if (patch.autoResolveOnReply != null) autoResolveOnReply = patch.autoResolveOnReply;
      if (patch.transientHighValueOver != null && patch.transientHighValueOver >= 0) {
        transientHighValueOver = patch.transientHighValueOver;
        session.setValueThresholds({ transientBookings: transientHighValueOver });
      }
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
    getPanelHint: async () => ["queue", "thread", "facilities", "settings"],
    refreshFacilities: async () => ({ ok: true, message: "Demo facilities are loaded on this computer." }),
    setFacilityPick: async (phone, facilityId) => {
      session.setFacilityPick(phone, facilityId);
    },
    loadHistory: async (phone) => ({
      phone,
      messages: session.messagesFor(phone).map((message) => ({
        id: message.id,
        direction: message.direction,
        body: message.body,
        sentAt: message.sentAt,
        agentName: message.direction === "outbound" ? "Avery" : "",
      })),
      nextCursor: null,
      bookings: session.bookingsFor(phone),
    }),
  };
}
