"use client";

import { useState } from "react";
import Link from "next/link";
import { money } from "@/lib/format";
import { bedsBaths, currentTenancy, sortTenants, unitPill } from "@/lib/admin-properties";
import UnitForm from "./UnitForm";
import DeleteRecord from "./DeleteRecord";
import { getBrowserClient } from "@/lib/supabase";

// A unit can only be removed when nothing has happened in it yet; otherwise it's set to Offline.
async function removeUnit(unit) {
  const sb = getBrowserClient();
  const count = (table) => sb.from(table).select("id", { count: "exact", head: true }).eq("unit_id", unit.id);
  const [t, m, i, tu] = await Promise.all([count("tenancies"), count("maintenance_requests"), count("inspections"), count("turnovers")]);
  const history = [
    [t.count, "tenancy", "tenancies"],
    [m.count, "maintenance request", "maintenance requests"],
    [i.count, "inspection", "inspections"],
    [tu.count, "turnover", "turnovers"],
  ].filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  if (history.length)
    throw new Error(`${unit.label} has history (${history.join(", ")}), so it can't be removed. Edit the unit and set it to Offline instead.`);
  const { error } = await sb.from("units").delete().eq("id", unit.id);
  if (error) throw new Error("We couldn't remove this unit. Try again.");
}

export default function UnitCard({ unit, propertyId, onSaved, onRemoved }) {
  const [editing, setEditing] = useState(false);
  const tenancy = currentTenancy(unit.tenancies || []);
  const tenants = sortTenants(tenancy?.tenancy_tenants || []);
  const canList = unit.status === "vacant" || unit.status === "turnover";

  if (editing) {
    return (
      <li className="unit-card editing">
        <h3 className="unit-label">Edit {unit.label}</h3>
        <UnitForm
          propertyId={propertyId}
          unit={unit}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            onSaved(saved);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className={`unit-card${unit.status === "offline" && tenancy?.status !== "upcoming" ? " is-offline" : ""}`}>
      <div className="req-top">
        <div className="req-who">
          <h3 className="unit-label">{unit.label}</h3>
          <span className="small">{[unit.unit_type, bedsBaths(unit)].filter(Boolean).join(" · ")}</span>
        </div>
        <div className="pill-row">
          {unit.management_type === "leasing_only" ? <span className="pill leasing-only">Leasing only</span> : null}
          {(() => { const p = unitPill(unit, tenancy); return <span className={`pill ${p.cls}`}>{p.text}</span>; })()}
        </div>
      </div>

      {unit.status === "occupied" && tenancy ? (
        <dl className="req-facts">
          <div>
            <dt>Tenants</dt>
            <dd>{tenants.length ? tenants.map((t) => t.full_name).join(", ") : "No tenants added"}</dd>
          </div>
          <div>
            <dt>Rent</dt>
            <dd className="num">{money(tenancy.rent)} / month</dd>
          </div>
        </dl>
      ) : (
        <dl className="req-facts">
          <div>
            <dt>Market rent</dt>
            <dd className="num">{unit.market_rent ? `${money(unit.market_rent)} / month` : "Not set"}</dd>
          </div>
          {tenancy?.status === "upcoming" ? (
            <div>
              <dt>Upcoming</dt>
              <dd>{tenants.map((t) => t.full_name).join(", ") || "Tenancy booked"}</dd>
            </div>
          ) : null}
        </dl>
      )}

      <div className="req-actions">
        <Link className="btn primary sm" href={`/admin/units/${unit.id}`}>
          Tenancy<span className="visually-hidden"> for {unit.label}</span>
        </Link>
        <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}>
          Edit unit<span className="visually-hidden"> {unit.label}</span>
        </button>
        {unit.listing_id ? (
          <Link className="btn ghost sm" href={`/admin/listings/${unit.listing_id}`}>
            Edit Listing
          </Link>
        ) : canList ? (
          <Link className="btn ghost sm" href={`/admin/listings/new?unit=${unit.id}`}>
            Create listing<span className="visually-hidden"> for {unit.label}</span>
          </Link>
        ) : null}
        {!tenancy ? (
          <DeleteRecord label="Remove unit" summary={`unit ${unit.label}`} run={() => removeUnit(unit)} onDeleted={() => onRemoved?.(unit.id)} className="unit-remove" />
        ) : null}
      </div>
    </li>
  );
}
