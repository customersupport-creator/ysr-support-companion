import { useEffect, useState } from "react";
import type { CustomerHistoryPage, FacilityAccess, FacilityListItem, IssueSummary, ValueScore, YsrApi } from "../../shared/types";

export function ValueBadge({ value }: { value: ValueScore }) {
  const label = value.tier === "high" ? "High value" : value.tier === "regular" ? "Regular" : "New";
  return (
    <span className={`value-badge ${value.tier}`} title={value.reason}>
      {label}
    </span>
  );
}

export function IssueTags({
  issues,
  onJump,
}: {
  issues: IssueSummary[];
  onJump?: (messageId: string) => void;
}) {
  if (issues.length === 0) return null;
  return (
    <span className="issue-tags">
      {issues.map((issue) => (
        <button
          key={issue.category}
          type="button"
          className={issue.current ? "issue current" : "issue"}
          style={{ color: issue.color, borderColor: issue.color }}
          title={issue.latest.snippet}
          onClick={() => onJump?.(issue.latest.messageId)}
        >
          {issue.label}
          {issue.count > 1 ? ` x${issue.count}` : ""}
          {issue.repeatFacility ? " · same facility" : ""}
        </button>
      ))}
    </span>
  );
}

export function AccessChip({
  access,
  alwaysShow,
  onCopy,
}: {
  access: FacilityAccess;
  alwaysShow: boolean;
  onCopy: (code: string) => void;
}) {
  const [shown, setShown] = useState(alwaysShow);
  useEffect(() => setShown(alwaysShow), [alwaysShow]);
  if (access.codedGarageNoCode) {
    return (
      <div className="code-chip warn">
        <strong>Coded garage, no code on file</strong>
        <p>{access.instructions}</p>
      </div>
    );
  }
  if (access.codes.length === 0) return null;
  return (
    <div className="code-chip">
      <div className="code-top">
        <span>Garage code</span>
        <b>{access.accessType}</b>
        <button type="button" className="texty" onClick={() => setShown((value) => !value)}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {access.codes.map((entry) => (
        <p key={`${entry.label}-${entry.code}`} className="code-line">
          {entry.label ? <span className="meta">{entry.label}</span> : null}
          <strong className="code-digits">{shown ? entry.code : "••••"}</strong>
          <button type="button" onClick={() => onCopy(entry.code)}>
            Copy
          </button>
        </p>
      ))}
      {access.instructions ? <p className="meta">{access.instructions}</p> : null}
      {access.confidence === "medium" ? <p className="warn-line">Medium confidence - verify</p> : null}
    </div>
  );
}

export function FacilityPicker({
  facilities,
  selectedId,
  onPick,
}: {
  facilities: FacilityListItem[];
  selectedId: string | null;
  onPick: (facilityId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = facilities
    .filter((facility) => {
      const hay = `${facility.name} ${facility.address}`.toLowerCase();
      return hay.includes(query.trim().toLowerCase());
    })
    .slice(0, 30);
  return (
    <label className="facility-pick">
      Facility
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search facilities" />
      <select value={selectedId ?? ""} onChange={(event) => onPick(event.target.value || null)}>
        <option value="">Match from the thread</option>
        {filtered.map((facility) => (
          <option key={facility.id} value={facility.id}>
            {facility.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function CustomerHistory({
  phone,
  api,
  issues,
  value,
  facilities,
  onUseFacility,
  onCopy,
}: {
  phone: string;
  api: YsrApi;
  issues: IssueSummary[];
  value: ValueScore;
  facilities: FacilityListItem[];
  onUseFacility: (facilityId: string) => void;
  onCopy: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"conversation" | "bookings">("conversation");
  const [page, setPage] = useState<CustomerHistoryPage | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || page) return undefined;
    let alive = true;
    void api.loadHistory(phone).then(
      (next) => {
        if (alive) setPage(next);
      },
      (reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "History did not load.");
      },
    );
    return () => {
      alive = false;
    };
  }, [open, page, api, phone]);

  const jump = (messageId: string) => {
    setOpen(true);
    setTab("conversation");
    window.setTimeout(() => document.getElementById(`msg-${messageId}`)?.scrollIntoView({ block: "nearest" }), 50);
  };

  const messages = (page?.messages ?? []).filter((message) => {
    const hay = `${message.body} ${message.agentName}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });
  const groups = new Map<string, typeof messages>();
  for (const message of messages) {
    const key = dayKey(message.sentAt);
    const list = groups.get(key) ?? [];
    list.push(message);
    groups.set(key, list);
  }

  return (
    <details
      className="history"
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary>Customer history</summary>
      <div className="summary-row">
        <ValueBadge value={value} />
        <span>{value.totalBookings} bookings</span>
        <span>{value.distinctMonths12} months</span>
        <span>{value.favoriteFacility ? `Mostly ${value.favoriteFacility}` : "No favorite facility"}</span>
        <span>{value.lastBooking ? `Last ${dayKey(value.lastBooking)}` : "No booking date"}</span>
      </div>
      <p className="meta">{value.reason}</p>
      <div className="issues-block">
        <h3>Issues</h3>
        {issues.length === 0 ? <p className="empty">No past issues detected.</p> : null}
        <ul>
          {issues.map((issue) => (
            <li key={issue.category}>
              <button type="button" className="issue" style={{ color: issue.color }} onClick={() => jump(issue.latest.messageId)}>
                {issue.label}
                {issue.count > 1 ? ` x${issue.count}` : ""}
                {issue.current ? " · current" : ""}
                {issue.repeatFacility ? " · repeat at this facility" : ""}
              </button>
              <span className="meta">
                {dayKey(issue.latest.at)}
                {issue.latest.facility ? ` · ${issue.latest.facility}` : ""}
                {issue.latest.rentalId ? ` · ${issue.latest.rentalId}` : ""}
              </span>
              <q>{issue.latest.snippet}</q>
            </li>
          ))}
        </ul>
      </div>
      <div className="history-tabs">
        <button type="button" className={tab === "conversation" ? "tab on" : "tab"} onClick={() => setTab("conversation")}>
          Conversation
        </button>
        <button type="button" className={tab === "bookings" ? "tab on" : "tab"} onClick={() => setTab("bookings")}>
          Bookings
        </button>
      </div>
      {error ? <p className="warn-line">{error}</p> : null}
      {tab === "conversation" ? (
        <div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this conversation" />
          {[...groups.entries()].map(([day, items]) => (
            <section key={day}>
              <h3>{day}</h3>
              <ol className="transcript">
                {items.map((message) => (
                  <li id={`msg-${message.id}`} key={message.id} className={`bubble ${message.direction}`}>
                    <span>
                      {message.direction === "inbound" ? "Customer" : message.agentName || "Us"}
                    </span>
                    <p>{message.body}</p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {page?.nextCursor ? (
            <button
              type="button"
              onClick={() => {
                void api.loadHistory(phone, page.nextCursor).then((next) => setPage(next));
              }}
            >
              Load more
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="cards">
          {(page?.bookings ?? []).map((booking) => {
            const facility = facilities.find(
              (item) => item.name === booking.facilityName || booking.facilityName.toLowerCase().includes(item.name.split("-")[0].trim().toLowerCase()),
            );
            return (
              <li key={`${booking.source}-${booking.id}`}>
                <button
                  type="button"
                  className="card-open"
                  onClick={() => {
                    if (facility) onUseFacility(facility.id);
                  }}
                >
                  <strong>{booking.id}</strong>
                  <span>{booking.facilityName || "Facility not listed"}</span>
                  <span className="meta">
                    {booking.platform || booking.source} · {booking.status || "status unknown"}
                    {booking.plate ? ` · ${booking.plate}` : ""}
                  </span>
                  <span className="meta">
                    {booking.start ? dayKey(booking.start) : "No start"}
                    {booking.end ? ` – ${dayKey(booking.end)}` : ""}
                  </span>
                </button>
                {facility?.access ? <AccessChip access={facility.access} alwaysShow={false} onCopy={onCopy} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
