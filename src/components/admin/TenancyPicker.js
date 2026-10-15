"use client";

import { useState } from "react";
import { tenancyLabel, tenancySearchText } from "@/lib/rent";

export default function TenancyPicker({ id, tenancies, value, onChange, label = "Tenancy" }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q ? tenancies.filter((t) => tenancySearchText(t).includes(q)) : tenancies;
  const selected = tenancies.find((t) => t.id === value);
  const options = selected && !matches.includes(selected) ? [selected, ...matches] : matches;

  return (
    <div className="picker">
      <div className="field">
        <label htmlFor={`${id}-q`}>Find a tenancy</label>
        <input
          id={`${id}-q`}
          type="search"
          placeholder="Tenant name or address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
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
