// The IRep house mark. Outline and door follow the text colour; the house stays IRep Red.
export function IRepMark({ className }) {
  return (
    <svg className={className} viewBox="2.31 10.31 115.38 144.38" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M10 148 L10 62 A50 50 0 0 1 110 62 L110 148 L106 148 L106 62 A46 46 0 0 0 14 62 L14 148 Z" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M18 148 L18 62 A42 42 0 0 1 102 62 L102 148 Z M60 64 L71.7 75 L69 75 L69 85.5 L51 85.5 L51 75 L48.3 75 Z M55.5 90 L64.5 90 L68.5 124 L51.5 124 Z"
      />
      <path fill="#B41710" d="M60 64 L71.7 75 L69 75 L69 85.5 L51 85.5 L51 75 L48.3 75 Z" />
      <path fill="currentColor" d="M4 148 L116 148 L116 153 L4 153 Z" />
    </svg>
  );
}

export function PhotoPlaceholder({ label }) {
  return (
    <div className="ph">
      <IRepMark />
      {label ? <span className="visually-hidden">{label}</span> : null}
    </div>
  );
}
