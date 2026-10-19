"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { propertyTitle } from "@/lib/admin-properties";
import { CLOSED_STATUSES, OWNER_APPROVAL, STATUS, prettyDay } from "@/lib/maintenance";
import { MaintenancePills } from "./MaintenanceBadges";
import { partnerName } from "./MaintenanceTable";

// Landlords → Work Orders: the maintenance jobs at each landlord's property seen from the landlord's
// side: what needs their OK, what's under way, and what was charged to them each month.
const SELECT =
  "id, title, urgency, status, owner_approval, estimated_cost, actual_cost, charge_to, completed_at, created_at, scheduled_for, " +
  "unit:units(id, label, property:properties(id, address, city, owner:owners(id, name))), partner:partners(id, name, company)";
const VIEWS = [
  { key: "approval", label: "Needs Landlord OK", test: (r) => r.owner_approval === "pending" && !CLOSED_STATUSES.includes(r.status) },
  { key: "open", label: "Open", test: (r) => !CLOSED_STATUSES.includes(r.status) },
  { key: "charged", label: "Charged to Landlord", test: (r) => r.status === "completed" && r.charge_to === "owner" },
  { key: "all", label: "All", test: () => true },
];
const money = (n) => (n == null || n === "" ? "—" : `$${Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const CHARGE = { owner: "Landlord", tenant: "Tenant", irep: "IRep" };
const monthKey = (d) => (d ? String(d).slice(0, 7) : "");
const monthName = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-CA", { month: "long", year: "numeric" });

export default function WorkOrdersBoard() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("approval");
  const [ownerId, setOwnerId] = useState("");
  const [month, setMonth] = useState("");

  useEffect(() => {
    getBrowserClient()
      .from("maintenance_requests")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        setRows(data || []);
        setError(err ? "We couldn't load work orders. Refresh the page to try again." : "");
      });
  }, []);

  const owners = useMemo(() => {
    const seen = new Map();
    for (const r of rows || []) {
      const o = r.unit?.property?.owner;
      if (o && !seen.has(o.id)) seen.set(o.id, o);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const months = useMemo(
    () => [...new Set((rows || []).filter((r) => r.completed_at).map((r) => monthKey(r.completed_at)))].sort().reverse(),
    [rows]
  );

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.key, (rows || []).filter(v.test).length])), [rows]);
  const test = VIEWS.find((v) => v.key === view).test;
  const shown = (rows || []).filter(
    (r) =>
      test(r) &&
      (!ownerId || r.unit?.property?.owner?.id === ownerId) &&
      (view !== "charged" || !month || monthKey(r.completed_at) === month)
  );
  const chargedTotal = shown.reduce((a, r) => a + Number(r.actual_cost ?? r.estimated_cost ?? 0), 0);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="admin-head">
        <div style={{ display: "grid", gap: 8 }}>
          <span className="eyebrow">Staff · Landlords</span>
          <h1 className="admin-title">Work Orders</h1>
          <p className="small">
            Repairs and jobs at each landlord&apos;s property: what needs their OK (over $250, emergencies excepted), what&apos;s
            under way, and what was charged to them.
          </p>
        </div>
        <Link className="btn primary" href="/admin/maintenance/new">
          New Work Order
        </Link>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      <div className="sec-head">
        <div className="seg" role="group" aria-label="Which work orders">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => setView(v.key)}>
              {v.label}
              {rows && v.key !== "all" ? ` (${counts[v.key]})` : ""}
            </button>
          ))}
        </div>
        <div className="req-actions">
          {view === "charged" ? (
            <div className="field" style={{ minWidth: 170 }}>
              <label htmlFor="wo-month" className="visually-hidden">Month completed</label>
              <select id="wo-month" value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="">Any month</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthName(m)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="field" style={{ minWidth: 200 }}>
            <label htmlFor="wo-owner" className="visually-hidden">Landlord</label>
            <select id="wo-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">All landlords</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {rows === null ? (
        <p className="small">Loading work orders…</p>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p>{view === "approval" ? "Nothing is waiting on a landlord's OK." : "No work orders match."}</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Property / landlord</th>
                <th scope="col">Work order</th>
                <th scope="col">Status</th>
                <th scope="col">Contractor</th>
                <th scope="col" className="r">Estimate</th>
                <th scope="col" className="r">Actual</th>
                <th scope="col">Charged to</th>
                <th scope="col" className="r"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="addr">
                    {r.unit?.property ? propertyTitle(r.unit.property) : "Unknown property"}
                    <span className="small sub-line">
                      {[r.unit?.label, r.unit?.property?.owner?.name].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td>
                    <b>{r.title}</b>
                    <span className="small sub-line">
                      {r.completed_at ? `Completed ${prettyDay(r.completed_at)}` : `Opened ${prettyDay(r.created_at)}`}
                    </span>
                  </td>
                  <td>
                    <MaintenancePills request={r} />
                    {r.owner_approval !== "not_needed" && r.owner_approval !== "pending" ? (
                      <span className="small sub-line">Landlord: {OWNER_APPROVAL[r.owner_approval]}</span>
                    ) : null}
                  </td>
                  <td className="small">{r.partner ? partnerName(r.partner) : "Not assigned"}</td>
                  <td className="r">{money(r.estimated_cost)}</td>
                  <td className="r">{money(r.actual_cost)}</td>
                  <td className="small">{CHARGE[r.charge_to] || "—"}</td>
                  <td className="r">
                    <Link className="btn ghost sm" href={`/admin/maintenance/${r.id}`}>
                      Open<span className="visually-hidden"> {r.title}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            {view === "charged" ? (
              <tfoot>
                <tr>
                  <th scope="row" colSpan={5}>
                    Total charged{month ? ` in ${monthName(month)}` : ""}
                  </th>
                  <td className="r">
                    <b>{money(chargedTotal)}</b>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
      <p className="small">
        Work orders are the same records as <Link href="/admin/maintenance">Maintenance</Link>; open one to book a
        contractor, ask the landlord for approval or record the cost. Status: {Object.values(STATUS).join(", ")}.
      </p>
    </div>
  );
}
