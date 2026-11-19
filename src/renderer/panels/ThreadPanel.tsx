import { useState } from "react";
import { SMS_SOFT_LIMIT } from "../../shared/constants";
import type { AppSnapshot } from "../../shared/types";
import { formatWait } from "../../core/format";

export function ThreadPanel({
  snap,
  note,
  onCommand,
  onOpenConfirm,
}: {
  snap: AppSnapshot;
  note: string;
  onCommand: (command: string) => void;
  onOpenConfirm: (text: string) => void;
}) {
  const [command, setCommand] = useState("");
  const thread = snap.thread;
  if (!thread) {
    return (
      <section className="panel">
        <p className="empty">Pick a customer from the queue.</p>
      </section>
    );
  }
  const blocked = thread.approval.status === "consent_blocked" || Boolean(thread.consent);
  const approved = thread.approval.status === "approved" ? thread.approval.approvedText : null;
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
          <p>No unanswered customer text.</p>
        )}
      </header>
      {blocked ? (
        <div className="callout danger">
          <strong>Consent warning. Do not text.</strong>
          <p>{thread.consent?.reason ?? thread.approval.notice}</p>
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
      {thread.draftStatus === "drafting" ? <p className="empty">Drafting from the playbook…</p> : null}
      {thread.draftStatus === "error" ? <p className="callout danger">{thread.draftError}</p> : null}
      {thread.draftStatus === "skipped" ? <p className="callout">{thread.approval.notice}</p> : null}
      {thread.draft && !blocked ? (
        <div className="draft">
          <h3>What they need</h3>
          <p>{thread.draft.concern}</p>
          <p className="meta">
            Mood: {thread.draft.mood}
            {thread.draft.facilityName ? ` · ${thread.draft.facilityName}` : ""}
            {thread.draft.reservation?.rentalId ? ` · ${thread.draft.reservation.rentalId} (${thread.draft.reservation.status})` : ""}
          </p>
          <p className="meta">{thread.draft.sopNote}</p>
          {thread.draft.urgent ? <p className="meta">Escalate. Do not promise money or fault.</p> : null}
          {thread.draft.disagreementNotes.map((item) => (
            <p key={item} className="callout warn">
              {item}
            </p>
          ))}
          {thread.draft.agentQuestion ? <p className="meta">{thread.draft.agentQuestion}</p> : null}
          {thread.correctionSummary ? <p className="meta">Your past edits: {thread.correctionSummary}</p> : null}
          {thread.draft.matchedSops.map((match) => (
            <details key={`${match.sop.number}-${match.sop.name}`}>
              <summary>
                SOP {match.sop.number} {match.sop.name}
                {match.sop.source === "airtable" ? " · table" : " · playbook"}
              </summary>
              <p>{match.sop.steps}</p>
              {match.sop.escalateTo ? <p>Escalate to: {match.sop.escalateTo}</p> : null}
            </details>
          ))}
          {thread.draft.options.map((option) => (
            <article key={option.id} className="option">
              <header>
                <strong>{option.id}</strong>
                <span>{option.label}</span>
                <span className={option.text.length > SMS_SOFT_LIMIT ? "len over" : "len"}>{option.text.length}/320</span>
              </header>
              <p>{option.text}</p>
              <button type="button" disabled={blocked} onClick={() => onCommand(`APPROVE ${option.id}`)}>
                APPROVE {option.id}
              </button>
            </article>
          ))}
        </div>
      ) : null}
      {thread.approval.status === "mine_logged" && thread.approval.candidateText ? (
        <article className="option mine">
          <header>
            <strong>MINE</strong>
            <span>Your text, unchanged, not approved</span>
          </header>
          <pre className="exact">{thread.approval.candidateText}</pre>
          <button type="button" onClick={() => onCommand("APPROVE")}>
            APPROVE this text
          </button>
        </article>
      ) : null}
      {approved ? (
        <button type="button" className="send wide" onClick={() => onOpenConfirm(approved)}>
          Review and send approved text
        </button>
      ) : null}
      {thread.approval.notice ? <p className="meta">{thread.approval.notice}</p> : null}
      <div className="command-row">
        <button type="button" disabled={blocked} onClick={() => onCommand("REJECT")}>
          REJECT
        </button>
        <button type="button" disabled={blocked} onClick={() => onCommand("SKIP")}>
          SKIP
        </button>
        <button type="button" disabled={blocked} onClick={() => onCommand("REDRAFT")}>
          REDRAFT
        </button>
      </div>
      <form
        className="command-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!command.trim()) return;
          onCommand(command);
          setCommand("");
        }}
      >
        <label htmlFor="command">Command</label>
        <textarea
          id="command"
          value={command}
          placeholder="APPROVE A, EDIT: make it shorter, MINE: your exact text, REJECT, SKIP"
          onChange={(event) => setCommand(event.target.value)}
        />
        <button type="submit" disabled={blocked || !command.trim()}>
          Run
        </button>
      </form>
      {note ? <p className="footnote">{note}</p> : null}
    </section>
  );
}
