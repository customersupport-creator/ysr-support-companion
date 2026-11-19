import { useEffect, useState } from "react";
import { SUPPORT_LINE_DISPLAY, type PanelId } from "../shared/constants";
import type { AppSnapshot, YsrApi } from "../shared/types";
import { UrgentBell } from "./components/UrgentBell";
import { createBrowserDemo } from "./browserDemo";
import { deskPanels } from "./panels/registry";
import { QueuePanel } from "./panels/QueuePanel";
import { SettingsPanel } from "./panels/SettingsPanel";
import { CommitmentsPanel, FacilityAlertsPanel, FollowUpsPanel } from "./panels/OpsPanels";
import { FacilitiesPanel } from "./panels/FacilitiesPanel";
import { ThreadPanel } from "./panels/ThreadPanel";

async function resolveApi(): Promise<YsrApi> {
  if (window.ysr) return window.ysr;
  return createBrowserDemo();
}

export function App() {
  const [api, setApi] = useState<YsrApi | null>(null);
  const [snap, setSnap] = useState<AppSnapshot | null>(null);
  const [panel, setPanel] = useState<PanelId>("queue");
  const [note, setNote] = useState("");
  const [undo, setUndo] = useState<{ phone: string; label: string } | null>(null);

  useEffect(() => {
    if (!undo) return undefined;
    const timer = window.setTimeout(() => setUndo(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    let unsubscribe: () => void = () => undefined;
    let alive = true;
    void resolveApi().then((next) => {
      if (!alive) return;
      setApi(next);
      void next.getSnapshot().then((initial) => {
        if (alive) setSnap(initial);
      });
      unsubscribe = next.onSnapshot((nextSnap) => setSnap(nextSnap));
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  if (!api || !snap) return <div className="boot">Opening YourSpotRented…</div>;

  const openThread = (threadId: string) => {
    void api.selectThread(threadId);
    setPanel("thread");
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <strong>YourSpotRented</strong>
          <span>Support desk · {SUPPORT_LINE_DISPLAY}</span>
        </div>
        <div className="top-actions">
          <UrgentBell
            snap={snap}
            onOpenThread={(threadId) => {
              openThread(threadId);
            }}
            onResolve={(threadId) => {
              const item = snap.urgentItems.find((entry) => entry.threadId === threadId);
              void api.resolveThread(threadId).then((result) => {
                if (!result.ok || !item) return;
                setUndo({ phone: item.customerPhone, label: item.displayPhone });
              });
            }}
            onOpenNumber={(phone) => {
              void api.openNumber(phone).then((result) => setNote(result.message));
            }}
            onMarkSeen={() => void api.markUrgentSeen()}
          />
          <button
            type="button"
            className={snap.settings.available ? "avail on" : "avail"}
            aria-pressed={snap.settings.available}
            onClick={() => void api.setAvailable(!snap.settings.available)}
          >
            <i />
            {snap.settings.available ? "Available" : "Away"}
          </button>
          <button
            type="button"
            className={snap.settings.alwaysOnTop ? "pin on" : "pin"}
            aria-pressed={snap.settings.alwaysOnTop}
            title="Keep this window above RingCentral"
            onClick={() => void api.setAlwaysOnTop(!snap.settings.alwaysOnTop)}
          >
            Pin
          </button>
        </div>
      </header>
      <p className="status">
        <span className={`pill ${snap.connection.mode}`}>{snap.connection.mode === "demo" ? "Demo" : "Live"}</span>
        <span>{snap.connection.ringcentralDetail}</span>
      </p>
      {snap.banner ? <p className="banner">{snap.banner}</p> : null}
      {snap.facilityAlerts.map((alert) => (
        <p className="banner" key={alert.id}>
          {alert.toast}
        </p>
      ))}
      <nav className="tabs" aria-label="Panels">
        {deskPanels.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={panel === tab.id ? "tab on" : "tab"}
            onClick={() => setPanel(tab.id)}
          >
            {tab.label}
            {tab.count === "queue" ? <em>{snap.queue.length}</em> : null}
            {tab.count === "followups" ? <em>{snap.followUps.filter((item) => item.state === "due").length}</em> : null}
            {tab.count === "commitments" ? <em>{snap.commitments.filter((item) => item.status !== "done").length}</em> : null}
            {tab.count === "alerts" ? <em>{snap.facilityAlerts.length}</em> : null}
          </button>
        ))}
      </nav>
      <main>
        {panel === "queue" ? (
          <QueuePanel
            snap={snap}
            onOpen={openThread}
            onSimulate={() => void api.simulateInbound().then((result) => setNote(result.message))}
            onResolve={(threadId) => {
              const card = snap.queue.find((item) => item.threadId === threadId);
              void api.resolveThread(threadId).then((result) => {
                if (!result.ok || !card) return;
                setUndo({ phone: card.customerPhone, label: card.displayPhone });
              });
            }}
            onUnresolve={(phone) => {
              void api.unresolvePhone(phone);
              setUndo(null);
            }}
            onCopy={async (id) => {
              await api.copyText(id);
            }}
            onOpenNumber={(phone) => {
              void api.openNumber(phone).then((result) => setNote(result.message));
            }}
            api={api}
          />
        ) : null}
        {panel === "thread" ? (
          <ThreadPanel
            api={api}
            snap={snap}
            onCopy={async (id) => {
              await api.copyText(id);
            }}
            onOpenNumber={(phone) => {
              void api.openNumber(phone).then((result) => setNote(result.message));
            }}
            onResolve={(threadId) => {
              const phone = snap.thread?.customerPhone;
              const label = snap.thread?.displayPhone ?? "This number";
              void api.resolveThread(threadId).then((result) => {
                if (!result.ok || !phone) return;
                setUndo({ phone, label });
                setPanel("queue");
              });
            }}
          />
        ) : null}
        {panel === "followups" ? <FollowUpsPanel api={api} snap={snap} /> : null}
        {panel === "commitments" ? <CommitmentsPanel api={api} snap={snap} /> : null}
        {panel === "alerts" ? <FacilityAlertsPanel api={api} snap={snap} /> : null}
        {panel === "facilities" ? (
          <FacilitiesPanel
            api={api}
            snap={snap}
            onNote={setNote}
            onCopy={(text) => {
              void api.copyText(text);
            }}
          />
        ) : null}
        {panel === "settings" ? <SettingsPanel api={api} snap={snap} onNote={setNote} /> : null}
      </main>
      {note ? <p className="footnote">{note}</p> : null}
      {undo ? (
        <div className="snack" role="status">
          <span>Resolved {undo.label}. Nothing was sent.</span>
          <button
            type="button"
            onClick={() => {
              void api.unresolvePhone(undo.phone);
              setUndo(null);
            }}
          >
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
