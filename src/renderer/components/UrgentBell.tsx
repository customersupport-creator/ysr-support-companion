import { useEffect, useRef, useState } from "react";
import type { AppSnapshot } from "../../shared/types";
import { formatWait } from "../../core/format";
import { openActionLabel } from "../../core/ringcentralLink";
import alertUrl from "../assets/urgent-alert.wav";

export function UrgentBell({
  snap,
  onOpenThread,
  onResolve,
  onOpenNumber,
  onMarkSeen,
}: {
  snap: AppSnapshot;
  onOpenThread: (threadId: string) => void;
  onResolve: (threadId: string) => void;
  onOpenNumber: (phone: string) => void;
  onMarkSeen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef<number | null>(null);
  const count = snap.unseenUrgentCount;
  const label = openActionLabel(snap.settings.openNumbersIn);

  useEffect(() => {
    if (window.ysr?.onUrgentChime) {
      return window.ysr.onUrgentChime(() => {
        void new Audio(alertUrl).play().catch(() => undefined);
      });
    }
    if (previous.current === null) {
      previous.current = count;
      return undefined;
    }
    if (count > previous.current && snap.settings.available && snap.settings.urgentSound) {
      void new Audio(alertUrl).play().catch(() => undefined);
    }
    previous.current = count;
    return undefined;
  }, [count, snap.settings.available, snap.settings.urgentSound]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="bell-wrap" ref={root}>
      <button
        type="button"
        className="bell"
        aria-expanded={open}
        aria-label={count > 0 ? `Urgent, ${count} unseen` : "Urgent"}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3a6 6 0 0 0-6 6v3.2L4.3 15.2A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.8L18 12.2V9a6 6 0 0 0-6-6zm0 18a2.4 2.4 0 0 0 2.3-1.8h-4.6A2.4 2.4 0 0 0 12 21z"
            fill="currentColor"
          />
        </svg>
        {count > 0 ? <span className="bell-badge">{count > 9 ? "9+" : count}</span> : null}
      </button>
      {open ? (
        <div className="bell-panel" role="dialog" aria-label="Urgent threads">
          <div className="bell-head">
            <strong>Urgent</strong>
            <button type="button" className="texty" onClick={onMarkSeen} disabled={count === 0}>
              Mark seen
            </button>
          </div>
          {snap.urgentItems.length === 0 ? <p className="empty">No unresolved urgent threads.</p> : null}
          <ul>
            {snap.urgentItems.map((item) => (
              <li key={item.threadId} className={item.unseen ? "unseen" : ""}>
                <button type="button" className="bell-item" onClick={() => onOpenThread(item.threadId)}>
                  <span className="bell-top">
                    <b>{item.displayPhone}</b>
                    <time>{formatWait(Date.now() - Date.parse(item.waitingSince))}</time>
                  </span>
                  <span className="meta">{item.rentalIds[0] ? `Rental ID ${item.rentalIds[0]}` : "No rental ID yet"}</span>
                  <q>{item.preview}</q>
                  <span className="reasons">{item.reasons.join(" · ")}</span>
                </button>
                <span className="card-actions">
                  <button type="button" className="open-rc" onClick={() => onOpenNumber(item.customerPhone)}>
                    {label}
                  </button>
                  <button type="button" className="resolve" onClick={() => onResolve(item.threadId)}>
                    Resolve
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
