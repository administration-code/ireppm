"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { primaryTenant, shortDate } from "@/lib/rent";
import { NOTICE_FIELDS, NOTICE_FORMS, NOTICE_STATUS, effectiveLabel, noticeName } from "@/lib/notices";
import { NoticeStatus } from "./NoticesPanel";
import EarlyMoveOuts from "./EarlyMoveOuts";

const SELECT = `${NOTICE_FIELDS}, tenancy:tenancies(id, unit:units(id, label, property:properties(id, address)), tenancy_tenants(full_name, is_primary, created_at))`;

export default function NoticesTable() {
  const [state, setState] = useState({ loading: true, notices: [], error: "" });
  const [form, setForm] = useState("");
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState("");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("notices")
      .select(SELECT)
      .order("served_on", { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        setState({
          loading: false,
          notices: data || [],
          error: error ? "We couldn't load notices. Refresh the page to try again." : "",
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(
    () =>
      state.notices.filter(
        (n) =>
          (!form || n.form === form) &&
          (!status || n.status === status) &&
          (!/^\d{4}-\d{2}$/.test(month) || String(n.served_on).startsWith(month))
      ),
    [state.notices, form, status, month]
  );

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8 }}>
            <span className="eyebrow">Staff</span>
            <h1 className="admin-title">Notices</h1>
            <p className="small">Every N-form served or received, across all tenancies. Log new ones on the unit page.</p>
          </div>
        </div>
      </div>

      <EarlyMoveOuts />

      <div className="filters">
        <div className="field">
          <label htmlFor="nf-form">Form</label>
          <select id="nf-form" value={form} onChange={(e) => setForm(e.target.value)}>
            <option value="">All forms</option>
            {Object.entries(NOTICE_FORMS).map(([k, v]) => (
              <option key={k} value={k}>
                {k === "other" ? v : `${k} ${v}`}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nf-status">Status</label>
          <select id="nf-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(NOTICE_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nf-month">Served in</label>
          <input id="nf-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      {state.error ? <div className="warnbox">{state.error}</div> : null}

      {state.loading ? (
        <p className="small">Loading notices…</p>
      ) : !shown.length ? (
        <p className="small">{state.notices.length ? "No notices match these filters." : "No notices logged yet."}</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Served</th>
                <th scope="col">Form</th>
                <th scope="col">Tenant</th>
                <th scope="col">Unit</th>
                <th scope="col">Effective / termination</th>
                <th scope="col" className="r">
                  Amount
                </th>
                <th scope="col">Status</th>
                <th scope="col">LTB file</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((n) => {
                const unit = n.tenancy?.unit;
                return (
                  <tr key={n.id} className={n.status === "void" ? "is-void" : undefined}>
                    <td>{shortDate(n.served_on)}</td>
                    <td>{noticeName(n)}</td>
                    <td>{primaryTenant(n.tenancy)}</td>
                    <td className="addr">
                      {unit ? (
                        <Link href={`/admin/units/${unit.id}`}>
                          {[unit.property?.address, unit.label].filter(Boolean).join(", ")}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {n.effective_date ? (
                        <>
                          <span className="visually-hidden">{effectiveLabel(n.form)}: </span>
                          {shortDate(n.effective_date)}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="r num">{n.amount != null ? money(n.amount) : "—"}</td>
                    <td>
                      <NoticeStatus status={n.status} />
                    </td>
                    <td>{n.ltb_file_number || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
