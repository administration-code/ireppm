"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { CLOSED_STATUSES, prettyDateTime, prettyDay, sortRequests } from "@/lib/maintenance";
import { MaintenancePills } from "./MaintenanceBadges";

export default function PropertyMaintenance({ propertyId, unitIds }) {
  const key = unitIds.join(",");
  const [state, setState] = useState({ loading: true, rows: [], error: "" });

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!ids.length) {
      setState({ loading: false, rows: [], error: "" });
      return;
    }
    let alive = true;
    getBrowserClient()
      .from("maintenance_requests")
      .select("id, title, urgency, status, scheduled_for, owner_approval, created_at, unit:units(id, label)")
      .in("unit_id", ids)
      .not("status", "in", `(${CLOSED_STATUSES.join(",")})`)
      .then(({ data, error }) => {
        if (!alive) return;
        setState({ loading: false, rows: data || [], error: error ? "We couldn't load maintenance for this property." : "" });
      });
    return () => {
      alive = false;
    };
  }, [key]);

  const { loading, rows, error } = state;

  return (
    <section className="boxed stack" aria-labelledby="sec-prop-maint">
      <div className="sec-head">
        <h2 id="sec-prop-maint" className="sec-title">
          Open Maintenance
        </h2>
        <Link className="btn ghost sm" href={`/admin/maintenance/new?property=${propertyId}`}>
          Log a Request
        </Link>
      </div>
      {error ? <div className="warnbox">{error}</div> : null}
      {loading ? (
        <p className="small">Loading maintenance…</p>
      ) : rows.length === 0 ? (
        !error ? <p className="small">No open requests for this property.</p> : null
      ) : (
        <ul className="maint-list">
          {sortRequests(rows).map((r) => (
            <li key={r.id}>
              <div>
                <Link href={`/admin/maintenance/${r.id}`}>
                  <b>{r.title}</b>
                </Link>
                <span className="small sub-line">
                  {[r.unit?.label, `Reported ${prettyDay(r.created_at)}`, r.scheduled_for ? `Booked ${prettyDateTime(r.scheduled_for)}` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <MaintenancePills request={r} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
