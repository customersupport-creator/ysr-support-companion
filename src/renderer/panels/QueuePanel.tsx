import { useEffect, useState } from "react";
import type { AppSnapshot, QueueCard } from "../../shared/types";
import { shouldAlertForWait } from "../../core/alerts";
import { formatWait } from "../../core/format";

export function QueuePanel({
  snap,
  onOpen,
  onSimulate,
}: {
  snap: AppSnapshot;
  onOpen: (threadId: string) => void;
  onSimulate: () => void;
}) {
  const now = useNow();
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Needs a reply</h2>
        {snap.connection.mode === "demo" ? (
          <button type="button" className="texty" onClick={onSimulate}>
            Simulate new text
          </button>
        ) : null}
      </div>
      <p className="meta">One alert per number, once the customer has been waiting 5 minutes.</p>
      {snap.queue.length === 0 ? <p className="empty">Nobody is waiting. New customer texts show up here.</p> : null}
      <ul className="cards">
        {snap.queue.map((card) => (
          <li key={card.key}>
            <Card card={card} now={now} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {snap.flagged.length > 0 ? (
        <>
          <h2 className="section-label">Do not text</h2>
          <ul className="cards">
            {snap.flagged.map((flag) => (
              <li key={flag.threadId}>
                <button type="button" className="card flag" onClick={() => onOpen(flag.threadId)}>
                  <strong>{flag.headline}</strong>
                  <span>{flag.reason}</span>
                  <q>{flag.preview}</q>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function Card({ card, now, onOpen }: { card: QueueCard; now: number; onOpen: (id: string) => void }) {
  const wait = formatWait(now - Date.parse(card.waitingSince));
  const ready = shouldAlertForWait(now - Date.parse(card.waitingSince));
  return (
    <button type="button" className={`card ${card.urgency.toLowerCase()}`} onClick={() => onOpen(card.threadId)}>
      <span className="card-top">
        <b className="urgency">{card.urgency}</b>
        {card.urgent ? <b className="badge">URGENT</b> : null}
        {ready ? <b className="badge alert">5 min</b> : null}
        <time>{wait}</time>
      </span>
      <strong>{card.headline}</strong>
      <q>{card.preview}</q>
      <span className="reasons">{card.reasons.join(" · ")}</span>
    </button>
  );
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
