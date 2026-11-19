import { useEffect, useState } from "react";
import type { AppSnapshot, QueueCard, YsrApi } from "../../shared/types";
import { shouldAlertForWait } from "../../core/alerts";
import { formatPhoneDisplay, formatWait } from "../../core/format";
import { resolvedLabel } from "../../core/replies";
import { openActionLabel } from "../../core/ringcentralLink";
import { AccessChip, CustomerHistory, FacilityPicker, IssueTags, ValueBadge } from "../components/CustomerContext";
import { RentalChips } from "../components/RentalChips";

export function QueuePanel({
  snap,
  onOpen,
  onSimulate,
  onResolve,
  onUnresolve,
  onCopy,
  onOpenNumber,
  api,
}: {
  snap: AppSnapshot;
  onOpen: (threadId: string) => void;
  onSimulate: () => void;
  onResolve: (threadId: string) => void;
  onUnresolve: (phone: string) => void;
  onCopy: (id: string) => Promise<void> | void;
  onOpenNumber: (phone: string) => void;
  api: YsrApi;
}) {
  const now = useNow();
  const [priority, setPriority] = useState(false);
  const openLabel = openActionLabel(snap.settings.openNumbersIn);
  const cards = priority
    ? [...snap.queue].sort((a, b) => rank(a) - rank(b) || b.waitMs - a.waitMs)
    : snap.queue;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Needs a reply</h2>
        <button type="button" className="texty" onClick={() => setPriority((value) => !value)}>
          {priority ? "Sort by wait" : "High value and urgent first"}
        </button>
        {snap.connection.mode === "demo" ? (
          <button type="button" className="texty" onClick={onSimulate}>
            Simulate new text
          </button>
        ) : null}
      </div>
      <p className="meta">One alert per number, once the customer has been waiting 5 minutes.</p>
      {snap.queue.length === 0 ? <p className="empty">Nobody is waiting. New customer texts show up here.</p> : null}
      <ul className="cards">
        {cards.map((card) => (
          <li key={card.key}>
            <Card
              card={card}
              snap={snap}
              api={api}
              now={now}
              openLabel={openLabel}
              onOpen={onOpen}
              onResolve={onResolve}
              onCopy={onCopy}
              onOpenNumber={onOpenNumber}
            />
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

function rank(card: QueueCard): number {
  const tier = card.value.tier === "high" ? 0 : card.value.tier === "regular" ? 1 : 2;
  return (card.urgent ? 0 : 10) + tier;
}

function Card({
  card,
  snap,
  api,
  now,
  onOpen,
  onResolve,
  onCopy,
  onOpenNumber,
  openLabel,
}: {
  card: QueueCard;
  snap: AppSnapshot;
  api: YsrApi;
  now: number;
  openLabel: string;
  onOpen: (id: string) => void;
  onResolve: (id: string) => void;
  onCopy: (id: string) => Promise<void> | void;
  onOpenNumber: (phone: string) => void;
}) {
  const wait = formatWait(now - Date.parse(card.waitingSince));
  const ready = shouldAlertForWait(now - Date.parse(card.waitingSince));
  return (
    <article className={`card ${card.urgency.toLowerCase()}`}>
      <div className="card-head">
        <ValueBadge value={card.value} />
        <IssueTags issues={card.issues} />
        {snap.followUps.some((item) => item.phone === card.customerPhone && item.state === "due") ? (
          <b className="badge">Follow-up due</b>
        ) : null}
      </div>
      <p className="headline">
        Hey, number{" "}
        <button type="button" className="phone-link" onClick={() => onOpenNumber(card.customerPhone)}>
          {card.displayPhone}
        </button>{" "}
        needs your attention
      </p>
      <button type="button" className="card-open" onClick={() => onOpen(card.threadId)}>
        <span className="card-top">
          <b className="urgency">{card.urgency}</b>
          {card.urgent ? <b className="badge">URGENT</b> : null}
          {ready ? <b className="badge alert">5 min</b> : null}
          <time>{wait}</time>
        </span>
        <q>{card.preview}</q>
        <span className="reasons">{card.reasons.join(" · ")}</span>
      </button>
      {card.access ? (
        <AccessChip access={card.access} alwaysShow={snap.settings.showAccessCodes} onCopy={(code) => void onCopy(code)} />
      ) : null}
      <FacilityPicker
        facilities={snap.facilities}
        selectedId={card.facilityRecordId}
        onPick={(facilityId) => void api.setFacilityPick(card.customerPhone, facilityId)}
      />
      <CustomerHistory
        phone={card.customerPhone}
        api={api}
        issues={card.issues}
        value={card.value}
        facilities={snap.facilities}
        onCopy={(code) => void onCopy(code)}
        onUseFacility={(facilityId) => void api.setFacilityPick(card.customerPhone, facilityId)}
      />
      <div className="card-foot">
        <RentalChips ids={card.rentalIds} onCopy={onCopy} />
        <span className="card-actions">
          <button type="button" className="open-rc" onClick={() => onOpenNumber(card.customerPhone)}>
            {openLabel}
          </button>
          <button type="button" className="resolve" onClick={() => onResolve(card.threadId)}>
            Resolve
          </button>
        </span>
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
            <span>
              {formatPhoneDisplay(record.phone)}
              <span className="meta"> {resolvedLabel(record)}</span>
            </span>
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
