import { REFERENCE_KINDS } from "@/lib/documents";
import { monthText } from "@/lib/application-client";

const KIND = Object.fromEntries(REFERENCE_KINDS.map((k) => [k.key, k.label]));

export default function ReferenceList({ references }) {
  const refs = Array.isArray(references) ? references.filter((r) => r?.name) : [];
  if (!refs.length) return <p className="small">No references listed.</p>;
  return (
    <ul className="ref-list">
      {refs.map((r, i) => {
        const dates = [monthText(r.since), monthText(r.until)].filter(Boolean).join(" to ");
        return (
          <li key={`${r.kind}-${i}`}>
            <span className="eyebrow">{KIND[r.kind] || "Reference"}</span>
            <b>{r.name}</b>
            {r.title ? <span className="small">{r.title}</span> : null}
            {r.relationship ? <span className="small">{r.relationship}</span> : null}
            {r.address ? <span className="small">{r.address}</span> : null}
            {dates ? <span className="small">{dates}</span> : null}
            {r.phone || r.email ? (
              <span className="row small" style={{ gap: "4px 16px" }}>
                {r.phone ? <a href={`tel:${String(r.phone).replace(/[^\d+]/g, "")}`}>{r.phone}</a> : null}
                {r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : null}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
