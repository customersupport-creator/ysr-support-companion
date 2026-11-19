import { useEffect, useState } from "react";
import type { AppSnapshot, QueueCard } from "../../shared/types";
import { shouldAlertForWait } from "../../core/alerts";
import { formatPhoneDisplay, formatWait } from "../../core/format";
import { RentalChips } from "../components/RentalChips";

export function QueuePanel({
  snap,
  onOpen,
  onSimulate,
  onResolve,
  onUnresolve,
  onCopy,
}: {
  snap: AppSnapshot;
  onOpen: (threadId: string) => void;
  onSimulate: () => void;
  onResolve: (threadId: string) => void;
  onUnresolve: (phone: string) => void;
  onCopy: (id: string) => Promise<void> | void;
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
            <Card card={card} now={now} onOpen={onOpen} onResolve={onResolve} onCopy={onCopy} />
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
      <ResolvedToday snap={snap} onUnresolve={onUnresolve} />
    </section>
  );
}

function Card({
  card,
  now,
  onOpen,
  onResolve,
  onCopy,
}: {
  card: QueueCard;
  now: number;
  onOpen: (id: string) => void;
  onResolve: (id: string) => void;
  onCopy: (id: string) => Promise<void> | void;
}) {
  const wait = formatWait(now - Date.parse(card.waitingSince));
  const ready = shouldAlertForWait(now - Date.parse(card.waitingSince));
  return (
    <article className={`card ${card.urgency.toLowerCase()}`}>
      <button type="button" className="card-open" onClick={() => onOpen(card.threadId)}>
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
      <div className="card-foot">
        <RentalChips ids={card.rentalIds} onCopy={onCopy} />
        <button type="button" className="resolve" onClick={() => onResolve(card.threadId)}>
          Resolve
        </button>
      </div>
    </article>
  );
}

function ResolvedToday({ snap, onUnresolve }: { snap: AppSnapshot; onUnresolve: (phone: string) => void }) {
  const count = snap.resolvedToday.length;
  return (
    <details className="resolved">
      <summary>Resolved today ({count})</summary>
      {count === 0 ? <p className="empty">None yet. Resolve keeps a number off this computer only.</p> : null}
      <ul className="cards">
        {snap.resolvedToday.map((record) => (
          <li key={record.phone} className="resolved-row">
            <span>{formatPhoneDisplay(record.phone)}</span>
            <button type="button" onClick={() => onUnresolve(record.phone)}>
              Undo
            </button>
          </li>
        ))}
      </ul>
    </details>
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
