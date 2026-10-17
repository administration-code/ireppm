"use client";

import { useState } from "react";
import { COMMON_FEATURES } from "@/lib/listing-details";

export default function FeaturesEditor({ features, onChange }) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (!value) return;
    if (!features.some((f) => f.toLowerCase() === value.toLowerCase())) onChange([...features, value]);
    setDraft("");
  }

  const presets = COMMON_FEATURES.filter((p) => !features.some((f) => f.toLowerCase() === p.toLowerCase()));

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="field">
        <label htmlFor="f-feature-pick">Common features</label>
        <select
          id="f-feature-pick"
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...features, e.target.value]);
          }}
        >
          <option value="">Pick one to add…</option>
          {presets.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="feature-add">
        <div className="field">
          <label htmlFor="f-feature">Or type your own</label>
          <input
            id="f-feature"
            value={draft}
            placeholder="Central air"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              add();
            }}
          />
        </div>
        <button type="button" className="btn ghost" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
      {features.length ? (
        <ul className="feature-list" aria-label="Features">
          {features.map((f, i) => (
            <li key={f}>
              <span>{f}</span>
              <button type="button" onClick={() => onChange(features.filter((_, j) => j !== i))}>
                Remove<span className="visually-hidden"> {f}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">No features yet. Examples: dishwasher, central air, fenced yard.</p>
      )}
    </div>
  );
}
