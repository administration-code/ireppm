"use client";

// Big tap buttons instead of a drop-down. options: [[value, label], ...] or { value: label }.
// Tapping the chosen one again clears it when clearable is set.
export default function TapPick({ label, hint, options, value, onChange, clearable = false, grid = false, big = false }) {
  const list = Array.isArray(options) ? options : Object.entries(options);
  return (
    <div className="stack" style={{ gap: 6 }} role="group" aria-label={label}>
      {label ? <span className="small">{label}</span> : null}
      <div
        style={
          grid
            ? { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }
            : { display: "flex", flexWrap: "wrap", gap: 8 }
        }
      >
        {list.map(([v, l]) => {
          const on = String(value) === String(v);
          return (
            <button
              key={String(v)}
              type="button"
              aria-pressed={on}
              className={`btn ${on ? "primary" : "ghost"} sm`}
              style={{ minHeight: big ? 52 : 44, textAlign: grid ? "left" : "center", whiteSpace: "normal" }}
              onClick={() => onChange(on && clearable ? "" : v)}
            >
              {on ? "✓ " : ""}
              {l}
            </button>
          );
        })}
      </div>
      {hint ? <span className="small">{hint}</span> : null}
    </div>
  );
}
