"use client";

import { useState } from "react";
import { propertyTitle } from "@/lib/admin-properties";
import { tenantMatches } from "@/lib/maintenance-units";

// Quick pick of the reporting tenant: the chosen property's current tenants as buttons,
// or a search of every current tenant by name, email or phone.
export default function ReporterPicker({ tenants, propertyId, onPick, idPrefix = "rp" }) {
  const [q, setQ] = useState("");
  const searching = q.trim().length > 0;
  const list = searching
    ? tenants.filter((t) => tenantMatches(t, q)).slice(0, 8)
    : propertyId
      ? tenants.filter((t) => t.property_id === propertyId)
      : [];

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="field">
        <label htmlFor={`${idPrefix}-search`}>Find the tenant</label>
        <input
          id={`${idPrefix}-search`}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, email or phone number"
          autoComplete="off"
        />
      </div>
      {list.length ? (
        <div className="stack" style={{ gap: 4 }}>
          <span className="small">{searching ? "Matches, click to fill in" : "Current tenants here, click to fill in"}</span>
          <ul className="plain-list reporter-picks">
            {list.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  className="btn ghost sm reporter-pick"
                  onClick={() => {
                    onPick(t);
                    setQ("");
                  }}
                >
                  <b>{t.name || "Unnamed tenant"}</b>
                  <span className="small">
                    {[searching ? propertyTitle(t.property) : null, t.unit_label, t.phone, t.email].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : searching ? (
        <span className="small">No current tenant matches. Type their details below instead.</span>
      ) : null}
    </div>
  );
}
