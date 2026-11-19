import type { AppSnapshot, YsrApi } from "../../shared/types";
import { AccessChip } from "../components/CustomerContext";

function age(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function FollowUpsPanel({ api, snap }: { api: YsrApi; snap: AppSnapshot }) {
  return (
    <section className="panel">
      <h2>Follow-ups</h2>
      <p className="meta">A promise to check back stays here until someone sends another text, snoozes it, or marks it done.</p>
      {snap.followUps.length === 0 ? <p className="empty">No open follow-ups.</p> : null}
      <ul className="cards">
        {snap.followUps.map((item) => (
          <li key={item.id} className="card">
            <strong>
              {item.displayPhone} · {item.state === "due" ? "Follow-up due" : item.state === "snoozed" ? "Snoozed" : "Waiting"}
            </strong>
            <q>
              {item.agentName} said “{item.quote}” {item.waitMinutes} min ago
            </q>
            <span className="card-actions">
              <button type="button" onClick={() => void api.snoozeFollowUp(item.id, 10)}>
                10 min
              </button>
              <button type="button" onClick={() => void api.snoozeFollowUp(item.id, 30)}>
                30 min
              </button>
              <button type="button" onClick={() => void api.snoozeFollowUp(item.id, 60)}>
                60 min
              </button>
              <button type="button" className="resolve" onClick={() => void api.completeFollowUp(item.id)}>
                Done
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CommitmentsPanel({ api, snap }: { api: YsrApi; snap: AppSnapshot }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Refunds and promises</h2>
        <button
          type="button"
          onClick={() => {
            void api.commitmentCsv().then((csv) => {
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "ysr-commitments.csv";
              link.click();
              URL.revokeObjectURL(url);
            });
          }}
        >
          Export CSV
        </button>
      </div>
      <p className="meta">Amounts are shown as written. Nothing is calculated and nothing is sent.</p>
      {snap.commitments.length === 0 ? <p className="empty">No commitments in the last 30 days.</p> : null}
      <ul className="cards">
        {snap.commitments.map((item) => (
          <li key={item.id} className={`card age-${item.ageTone}`}>
            <strong>
              {item.typeLabel} · {item.displayPhone}
              {item.customerName ? ` · ${item.customerName}` : ""}
            </strong>
            <span className="meta">
              {item.facility || "No facility"}
              {item.rentalId ? ` · ${item.rentalId}` : ""}
              {item.amount ? ` · ${item.amount}` : ""} · {item.agentName} · {age(item.ageMs)} · {item.status}
            </span>
            <q>{item.snippet}</q>
            {item.suggestDone ? <p className="warn-line">A later text says this was sent. Confirm before marking done.</p> : null}
            {item.note ? <p className="meta">Note: {item.note}</p> : null}
            <span className="card-actions">
              <button type="button" onClick={() => void api.updateCommitment(item.id, "waiting", item.note)}>
                Waiting on customer
              </button>
              <button type="button" className="resolve" onClick={() => void api.updateCommitment(item.id, "done", item.note)}>
                Done
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FacilityAlertsPanel({ api, snap }: { api: YsrApi; snap: AppSnapshot }) {
  return (
    <section className="panel">
      <h2>Facility alerts</h2>
      <p className="meta">Several customers reporting the same problem at one facility. Acknowledge hides it until a new report arrives.</p>
      {snap.facilityAlerts.length === 0 ? <p className="empty">No active facility alerts.</p> : null}
      <ul className="cards">
        {snap.facilityAlerts.map((alert) => (
          <li key={alert.id} className="card">
            <strong>{alert.toast}</strong>
            <ul>
              {alert.customers.map((customer) => (
                <li key={customer.messageId}>
                  {customer.displayPhone}: {customer.snippet}
                </li>
              ))}
            </ul>
            {alert.access ? (
              <AccessChip
                access={alert.access}
                alwaysShow={snap.settings.showAccessCodes}
                onCopy={(code) => void api.copyText(code)}
              />
            ) : null}
            <button type="button" onClick={() => void api.dismissFacilityAlert(alert.id)}>
              Acknowledge
            </button>
          </li>
        ))}
      </ul>
      <h3>Issue counts, last 7 days</h3>
      <ul className="cards">
        {snap.facilityIssueCounts.map((count) => (
          <li key={`${count.facilityName}-${count.category}`}>
            {count.facilityName} · {count.label} · {count.customers}
          </li>
        ))}
      </ul>
      <h3>Acknowledged, last 7 days</h3>
      {snap.facilityAlertHistory.length === 0 ? <p className="empty">None yet.</p> : null}
      <ul>
        {snap.facilityAlertHistory.map((alert) => (
          <li key={`${alert.id}-${alert.newestAt}`}>{alert.toast}</li>
        ))}
      </ul>
    </section>
  );
}
