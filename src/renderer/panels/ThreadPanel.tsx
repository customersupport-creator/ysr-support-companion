import type { AppSnapshot } from "../../shared/types";
import { extractFacilityFacts } from "../../core/facilityFacts";
import { formatWait } from "../../core/format";

export function ThreadPanel({ snap }: { snap: AppSnapshot }) {
  const thread = snap.thread;
  if (!thread) {
    return (
      <section className="panel">
        <p className="empty">Pick a customer from the queue.</p>
      </section>
    );
  }
  const facts = extractFacilityFacts(thread.facility?.notes ?? "");
  return (
    <section className="panel thread">
      <header className="thread-head">
        <h2>{thread.displayPhone}</h2>
        {thread.card ? (
          <p>
            <b className={`urgency inline ${thread.card.urgency.toLowerCase()}`}>{thread.card.urgency}</b>
            {thread.card.urgent ? <b className="badge">URGENT</b> : null}
            <span> waiting {formatWait(Date.now() - Date.parse(thread.card.waitingSince))}</span>
          </p>
        ) : (
          <p className="meta">No unanswered customer text.</p>
        )}
      </header>
      {thread.consent ? (
        <div className="callout danger">
          <strong>Consent warning. Do not text.</strong>
          <p>{thread.consent.reason}</p>
        </div>
      ) : null}
      <ol className="transcript">
        {thread.messages.map((message) => (
          <li key={message.id} className={`bubble ${message.direction}${message.reaction ? " reaction" : ""}`}>
            <span>{message.reaction ? "Reaction ignored" : message.direction === "inbound" ? "Customer" : "Us"}</span>
            <p>{message.body}</p>
          </li>
        ))}
      </ol>
      {thread.reservation ? (
        <div className="lookup">
          <h3>Reservation in the thread</h3>
          <p>
            {thread.reservation.rentalId ?? "No rental ID"}
            {thread.reservation.facility ? ` · ${thread.reservation.facility}` : ""}
            {thread.reservation.plate ? ` · ${thread.reservation.plate}` : ""}
            {` · ${thread.reservation.status}`}
          </p>
        </div>
      ) : (
        <p className="meta">No rental ID in this thread.</p>
      )}
      {thread.facility ? (
        <div className="lookup">
          <h3>{thread.facility.name}</h3>
          <p>{thread.facility.address}</p>
          <p className="meta">
            {thread.facility.facilityId}
            {thread.facility.status ? ` · ${thread.facility.status}` : ""}
            {thread.facility.towingCompany ? ` · Tow: ${thread.facility.towingCompany}` : ""}
            {thread.facility.salesTowAuthorization ? ` · Sales tow: ${thread.facility.salesTowAuthorization}` : ""}
          </p>
          {thread.facility.doNotTowPlates ? <p className="meta">Do not tow: {thread.facility.doNotTowPlates}</p> : null}
          {facts.gateCode ? <p>Gate code on file: {facts.gateCode}</p> : null}
          {facts.sizeLimit ? <p>Size limit: {facts.sizeLimit}</p> : null}
          {facts.directions ? <p>Directions: {facts.directions}</p> : null}
          {thread.facility.notes ? <p className="notes">{thread.facility.notes}</p> : null}
        </div>
      ) : null}
      <h3>Matched SOPs</h3>
      {thread.matchedSops.length === 0 ? <p className="empty">No SOP keyword match on the latest customer texts.</p> : null}
      {thread.matchedSops.map((match) => (
        <details key={`${match.sop.number}-${match.sop.name}`} open>
          <summary>
            SOP {match.sop.number} {match.sop.name}
            <span>{match.sop.source === "airtable" ? "Airtable" : "Playbook list"}</span>
          </summary>
          {match.sop.lookups ? <p>Look up: {match.sop.lookups}</p> : null}
          {match.sop.steps ? <p>{match.sop.steps}</p> : null}
          {match.sop.escalateTo ? <p>Escalate to: {match.sop.escalateTo}</p> : null}
          {match.sop.notes ? <p className="meta">{match.sop.notes}</p> : null}
        </details>
      ))}
    </section>
  );
}
