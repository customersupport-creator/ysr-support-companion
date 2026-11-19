import { useState } from "react";

export function RentalChips({
  ids,
  onCopy,
}: {
  ids: string[];
  onCopy: (id: string) => Promise<void> | void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  if (ids.length === 0) return <span className="no-id">No rental ID yet</span>;
  return (
    <span className="chips">
      {ids.map((id) => (
        <span key={id} className="chip">
          <span>{id}</span>
          <button
            type="button"
            className="chip-copy"
            aria-label={`Copy rental ID ${id}`}
            onClick={(event) => {
              event.stopPropagation();
              void Promise.resolve(onCopy(id)).then(() => {
                setCopied(id);
                window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1500);
              });
            }}
          >
            {copied === id ? "Copied" : "Copy"}
          </button>
        </span>
      ))}
    </span>
  );
}
