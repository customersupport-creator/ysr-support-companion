import { useMemo, useState } from "react";
import type { AppSnapshot, YsrApi } from "../../shared/types";
import { AccessChip } from "../components/CustomerContext";

function operating(status: string): boolean {
  return /in operation|active/i.test(status) && !/closed/i.test(status);
}

export function FacilitiesPanel({
  api,
  snap,
  onCopy,
  onNote,
}: {
  api: YsrApi;
  snap: AppSnapshot;
  onCopy: (text: string) => void;
  onNote: (note: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snap.facilities
      .filter((facility) => facility.access)
      .filter((facility) => showClosed || operating(facility.status))
      .filter((facility) => `${facility.name} ${facility.address} ${facility.access?.accessType ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(operating(b.status)) - Number(operating(a.status)) || a.name.localeCompare(b.name));
  }, [snap.facilities, query, showClosed]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Facilities with codes</h2>
        <button
          type="button"
          onClick={() => {
            void api.refreshFacilities().then((result) => onNote(result.message));
          }}
        >
          Refresh
        </button>
      </div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search facility or address" />
      <label className="check">
        <input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />
        Show closed facilities
      </label>
      <p className="meta">Codes stay hidden until you reveal them. Nothing is sent.</p>
      {rows.length === 0 ? <p className="empty">No facility codes match.</p> : null}
      <ul className="cards">
        {rows.map((facility) => (
          <li key={facility.id} className="card">
            <strong>{facility.name}</strong>
            <span className="meta">{facility.address}</span>
            <span className="meta">{facility.status}</span>
            {facility.access ? (
              <AccessChip access={facility.access} alwaysShow={snap.settings.showAccessCodes} onCopy={onCopy} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
