"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { propertyTitle } from "@/lib/admin-properties";
import { CLOSED_STATUSES, STATUS, URGENCY, prettyDateTime, prettyDay, sortRequests } from "@/lib/maintenance";
import { MaintenancePills } from "./MaintenanceBadges";

export const LIST_SELECT =
  "id, title, category, urgency, status, scheduled_for, owner_approval, created_at, unit:units(id, label, property:properties(id, address, city)), partner:partners(id, name, company)";

export const partnerName = (p) => (p ? [p.name, p.company].filter(Boolean).join(" · ") : "");

export default function MaintenanceTable() {
  const [state, setState] = useState({ loading: true, rows: [], error: "" });
  const [status, setStatus] = useState("open");
  const [urgency, setUrgency] = useState("");
  const [propertyId, setPropertyId] = useState("");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("maintenance_requests")
      .select(LIST_SELECT)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        setState({
          loading: false,
          rows: data || [],
          error: error ? "We couldn't load maintenance requests. Refresh the page to try again." : "",
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  const { loading, rows, error } = state;

  const properties = useMemo(() => {
    const seen = new Map();
    rows.forEach((r) => {
      const p = r.unit?.property;
      if (p && !seen.has(p.id)) seen.set(p.id, p);
    });
    return [...seen.values()].sort((a, b) => propertyTitle(a).localeCompare(propertyTitle(b)));
  }, [rows]);

  const shown = sortRequests(
    rows.filter(
      (r) =>
        (status === "all" ||
          (status === "open" ? !CLOSED_STATUSES.includes(r.status) : r.status === status)) &&
        (!urgency || r.urgency === urgency) &&
        (!propertyId || r.unit?.property?.id === propertyId)
    )
  );

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="admin-head">
        <div style={{ display: "grid", gap: 8 }}>
          <Link className="eyebrow back-link" href="/admin">
            ← Requests inbox
          </Link>
          <h1 className="admin-title">Maintenance</h1>
          <p className="small">Repairs reported by tenants or logged by staff. Emergencies are listed first.</p>
        </div>
        <Link className="btn primary" href="/admin/maintenance/new">
          Log a request
        </Link>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      {loading ? (
        <p className="small">Loading maintenance requests…</p>
      ) : rows.length === 0 && !error ? (
        <div className="empty">
          <h2>No maintenance requests yet</h2>
          <p>Requests from the tenant portal show up here. You can also log one taken by phone, text or email.</p>
          <Link className="btn ghost" href="/admin/maintenance/new">
            Log a request
          </Link>
        </div>
      ) : rows.length ? (
        <>
          <div className="filter-bar">
            <div className="field">
              <label htmlFor="m-status">Status</label>
              <select id="m-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="open">All open</option>
                <option value="all">All requests</option>
                {Object.entries(STATUS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="m-urgency">Urgency</label>
              <select id="m-urgency" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                <option value="">Any urgency</option>
                {Object.entries(URGENCY).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="m-property">Property</label>
              <select id="m-property" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                <option value="">All properties</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {propertyTitle(p)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="empty">
              <p>No requests match these filters.</p>
            </div>
          ) : (
            <div className="list table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Property</th>
                    <th scope="col">Request</th>
                    <th scope="col">Status</th>
                    <th scope="col">Partner</th>
                    <th scope="col">Scheduled</th>
                    <th scope="col" className="r">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <td className="addr">
                        {r.unit?.property ? propertyTitle(r.unit.property) : "Unknown property"}
                        {r.unit?.label ? <span className="small sub-line">{r.unit.label}</span> : null}
                      </td>
                      <td>
                        <b>{r.title}</b>
                        <span className="small sub-line">Reported {prettyDay(r.created_at)}</span>
                      </td>
                      <td>
                        <MaintenancePills request={r} />
                      </td>
                      <td>{r.partner ? partnerName(r.partner) : <span className="small">Not assigned</span>}</td>
                      <td>{r.scheduled_for ? prettyDateTime(r.scheduled_for) : <span className="small">Not booked</span>}</td>
                      <td className="r">
                        <Link className="btn ghost sm" href={`/admin/maintenance/${r.id}`}>
                          Open<span className="visually-hidden"> {r.title}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
