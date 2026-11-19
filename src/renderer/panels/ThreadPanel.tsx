import type { AppSnapshot, YsrApi } from "../../shared/types";
import { extractFacilityFacts } from "../../core/facilityFacts";
import { formatWait } from "../../core/format";
import { openActionLabel } from "../../core/ringcentralLink";
import { AccessChip, CustomerHistory, FacilityPicker, IssueTags, ValueBadge } from "../components/CustomerContext";
import { RentalChips } from "../components/RentalChips";

export function ThreadPanel({
  api,
  snap,
  onResolve,
  onCopy,
  onOpenNumber,
}: {
  api: YsrApi;
  snap: AppSnapshot;
  onResolve: (threadId: string) => void;
  onCopy: (id: string) => Promise<void> | void;
  onOpenNumber: (phone: string) => void;
}) {
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
        <h2>
          <button type="button" className="phone-link" onClick={() => onOpenNumber(thread.customerPhone)}>
            {thread.displayPhone}
          </button>
        </h2>
        {thread.card ? (
          <p>
            <ValueBadge value={thread.card.value} />
            <IssueTags issues={thread.card.issues} />
            <b className={`urgency inline ${thread.card.urgency.toLowerCase()}`}>{thread.card.urgency}</b>
            {thread.card.channel === "clicksend" ? <b className="badge alert">ClickSend</b> : null}
            {thread.card.channel === "clicksend" ? (
              <b className="badge">{thread.card.introSent ? "Intro sent" : "No intro yet"}</b>
            ) : null}
            {thread.card.urgent ? <b className="badge">URGENT</b> : null}
            <span> waiting {formatWait(Date.now() - Date.parse(thread.card.waitingSince))}</span>
          </p>
        ) : (
          <p className="meta">No unanswered customer text.</p>
        )}
      </header>
      <div className="card-foot">
        <RentalChips ids={thread.rentalIds} onCopy={onCopy} />
        <button type="button" className="open-rc" onClick={() => onOpenNumber(thread.customerPhone)}>
          {openActionLabel(snap.settings.openNumbersIn)}
        </button>
        {thread.card ? (
          <button type="button" className="resolve" onClick={() => onResolve(thread.id)}>
            Resolve
          </button>
        ) : null}
      </div>
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
          {facts.sizeLimit ? <p>Size limit: {facts.sizeLimit}</p> : null}
          {facts.directions ? <p>Directions: {facts.directions}</p> : null}
        </div>
      ) : null}
      {thread.card?.access ? (
        <AccessChip access={thread.card.access} alwaysShow={snap.settings.showAccessCodes} onCopy={(code) => void onCopy(code)} />
      ) : null}
      <FacilityPicker
        facilities={snap.facilities}
        selectedId={thread.card?.facilityRecordId ?? thread.facility?.id ?? null}
        onPick={(facilityId) => void api.setFacilityPick(thread.customerPhone, facilityId)}
      />
      {thread.card ? (
        <CustomerHistory
          phone={thread.customerPhone}
          api={api}
          issues={thread.card.issues}
          value={thread.card.value}
          facilities={snap.facilities}
          onCopy={(code) => void onCopy(code)}
          onUseFacility={(facilityId) => void api.setFacilityPick(thread.customerPhone, facilityId)}
        />
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
