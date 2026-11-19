import type { AppSnapshot } from "../../shared/types";

export function LearningPanel({ snap }: { snap: AppSnapshot }) {
  const { learning } = snap;
  return (
    <section className="panel">
      <h2>Your edits</h2>
      <p className="meta">
        Stored on this computer for {snap.settings.agentName || "this agent"}. The next draft reads the summary below.
        Airtable gets a copy only after you opt in under Settings.
      </p>
      {learning.summary ? <p className="callout">{learning.summary}</p> : <p className="empty">No edits yet.</p>}
      <ul className="corrections">
        {learning.corrections
          .slice()
          .reverse()
          .map((item) => (
            <li key={item.id}>
              <header>
                <strong>{item.kinds.join(", ")}</strong>
                <time>{item.at.slice(0, 16).replace("T", " ")}</time>
              </header>
              <p>
                <span>Before</span>
                {item.before}
              </p>
              <p>
                <span>After</span>
                {item.after}
              </p>
            </li>
          ))}
      </ul>
    </section>
  );
}
