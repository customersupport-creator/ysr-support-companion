import { useEffect, useState } from "react";
import { SUPPORT_LINE_DISPLAY, type PanelId } from "../shared/constants";
import type { AppSnapshot, YsrApi } from "../shared/types";
import { createBrowserDemo } from "./browserDemo";
import { deskPanels } from "./panels/registry";
import { QueuePanel } from "./panels/QueuePanel";
import { SettingsPanel } from "./panels/SettingsPanel";
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
          </button>
        ))}
      </nav>
      <main>
        {panel === "queue" ? (
          <QueuePanel
            snap={snap}
            onOpen={openThread}
            onSimulate={() => void api.simulateInbound().then((result) => setNote(result.message))}
          />
        ) : null}
        {panel === "thread" ? <ThreadPanel snap={snap} /> : null}
        {panel === "settings" ? <SettingsPanel api={api} snap={snap} onNote={setNote} /> : null}
      </main>
      {note ? <p className="footnote">{note}</p> : null}
    </div>
  );
}
