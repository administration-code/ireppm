"use client";

import { useState } from "react";
import { tenancyLabel, tenancySearchText } from "@/lib/rent";

// Every word typed must appear somewhere (tenant names, address, unit, city, email, phone).
function matchesQuery(t, q) {
  const hay = `${tenancySearchText(t)} ${(t.tenancy_tenants || [])
    .map((p) => `${p.email || ""} ${String(p.phone || "").replace(/\D/g, "")}`)
    .join(" ")}`.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w.replace(/[^\w@.]/g, "") || w));
}

export default function TenancyPicker({ id, tenancies, value, onChange, label = "Tenancy" }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q ? tenancies.filter((t) => matchesQuery(t, q)) : tenancies;
  const selected = tenancies.find((t) => t.id === value);
  const options = selected && !matches.includes(selected) ? [selected, ...matches] : matches;
  const shown = q ? matches.slice(0, 8) : [];

  function search(text) {
    setQuery(text);
    const qq = text.trim().toLowerCase();
    if (!qq) return;
    const found = tenancies.filter((t) => matchesQuery(t, qq));
    if (found.length === 1 && found[0].id !== value) onChange(found[0].id);
  }

  return (
    <div className="picker">
      <div className="field">
        <label htmlFor={`${id}-q`}>Find a tenancy</label>
        <input
          id={`${id}-q`}
          type="search"
          placeholder="Tenant name, address, email or phone"
          value={query}
          onChange={(e) => search(e.target.value)}
          autoComplete="off"
        />
        {q ? (
          shown.length ? (
            <ul className="plain-list picker-results" aria-label="Matching tenancies">
              {shown.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={t.id === value ? "picker-result is-selected" : "picker-result"}
                    aria-pressed={t.id === value}
                    onClick={() => {
                      onChange(t.id);
                      setQuery("");
                    }}
                  >
                    {tenancyLabel(t)}
                    {t.status === "ended" ? " (past)" : ""}
                  </button>
                </li>
              ))}
              {matches.length > shown.length ? (
                <li className="small">{matches.length - shown.length} more, keep typing to narrow it down</li>
              ) : null}
            </ul>
          ) : (
            <span className="small">No tenancies match that search.</span>
          )
        ) : null}
      </div>
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select id={id} value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">{matches.length ? "Choose a tenancy…" : "No tenancies match that search"}</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {tenancyLabel(t)}
              {t.status === "ended" ? " (past)" : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
