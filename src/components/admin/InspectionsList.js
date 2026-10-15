"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { prettyDate } from "@/lib/admin-properties";
import { INSPECTION_KIND, OVERALL_CONDITION } from "@/lib/inspections";

// Lists inspections for a unit, or only those for one tenancy when tenancyId is given.
export default function InspectionsList({ unitId, tenancyId, newHref, newLabel = "New inspection", title = "Inspections" }) {
  const [state, setState] = useState({ loading: true, rows: [], error: "" });

  useEffect(() => {
    let alive = true;
    let query = getBrowserClient()
      .from("inspections")
      .select("id, kind, inspected_on, inspected_by, overall_condition, rooms, tenancy_id, turnover_id")
      .order("inspected_on", { ascending: false });
    query = tenancyId ? query.eq("tenancy_id", tenancyId) : query.eq("unit_id", unitId);
    query.then(({ data, error }) => {
      if (!alive) return;
      setState({ loading: false, rows: data || [], error: error ? "We couldn't load inspections." : "" });
    });
    return () => {
      alive = false;
    };
  }, [unitId, tenancyId]);

  const { loading, rows, error } = state;
  const headingId = `sec-insp-${tenancyId || unitId}`;

  return (
    <section className="boxed stack" aria-labelledby={headingId}>
      <div className="sec-head">
        <h2 id={headingId} className="sec-title">
          {title}
        </h2>
        {newHref ? (
          <Link className="btn ghost sm" href={newHref}>
            {newLabel}
          </Link>
        ) : null}
      </div>
      {error ? <div className="warnbox">{error}</div> : null}
      {loading ? (
        <p className="small">Loading inspections…</p>
      ) : rows.length === 0 ? (
        !error ? <p className="small">No inspections recorded yet.</p> : null
      ) : (
        <ul className="maint-list">
          {rows.map((r) => {
            const rooms = (r.rooms || []).length;
            const photos = (r.rooms || []).reduce((n, room) => n + (room.photos?.length || 0), 0);
            return (
              <li key={r.id}>
                <div>
                  <Link href={`/admin/inspections/${r.id}`}>
                    <b>
                      {INSPECTION_KIND[r.kind] || r.kind} inspection, {prettyDate(r.inspected_on)}
                    </b>
                  </Link>
                  <span className="small sub-line">
                    {[
                      r.inspected_by ? `By ${r.inspected_by}` : "",
                      `${rooms} ${rooms === 1 ? "room" : "rooms"}`,
                      `${photos} ${photos === 1 ? "photo" : "photos"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {r.overall_condition ? (
                  <span className={`pill ic-${r.overall_condition}`}>{OVERALL_CONDITION[r.overall_condition]}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
