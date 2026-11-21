"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { monthLabel, shortDate, tenancyAddress, thisMonth, methodText } from "@/lib/rent";
import { MATCH_METHOD, matchLabel } from "@/lib/match-methods";
import RentNav, { RentHead } from "./RentNav";

// Staff: how each payment received in a month was tied to a tenancy, and by whom.
export default function MatchAudit() {
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState(null);
  const [people, setPeople] = useState({});
  const [how, setHow] = useState("");
  const [who, setWho] = useState("");

  useEffect(() => {
    let alive = true;
    setRows(null);
    const sb = getBrowserClient();
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    sb.from("payments")
      .select(
        "id, received_on, amount, method, kind, payer_name, source, match_method, matched_by, matched_at, period, tenancy:tenancies(id, unit:units(label, property:properties(address, city)), tenancy_tenants(full_name, is_primary))"
      )
      .eq("status", "matched")
      .gte("received_on", start)
      .lt("received_on", end)
      .order("received_on", { ascending: false })
      .then(async ({ data }) => {
        const list = data || [];
        const ids = [...new Set(list.map((r) => r.matched_by).filter(Boolean))];
        const { data: profs } = ids.length ? await sb.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
        if (!alive) return;
        setPeople(Object.fromEntries((profs || []).map((p) => [p.id, p.full_name || p.email])));
        setRows(list);
      });
    return () => {
      alive = false;
    };
  }, [month]);

  const shown = useMemo(
    () => (rows || []).filter((r) => (!how || (how === "none" ? !r.match_method : r.match_method === how)) && (!who || r.matched_by === who)),
    [rows, how, who]
  );
  const counts = useMemo(() => {
    const c = {};
    for (const r of rows || []) c[r.match_method || "none"] = (c[r.match_method || "none"] || 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <RentHead title="Matched By" intro="How each payment was tied to a tenancy: automatically, by a sender rule, or by a staff member." />
      <RentNav current="/admin/rent/audit" />
      <div className="row3">
        <div className="field">
          <label htmlFor="ma-month">Received in</label>
          <input id="ma-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ma-how">How</label>
          <select id="ma-how" value={how} onChange={(e) => setHow(e.target.value)}>
            <option value="">All ({rows?.length || 0})</option>
            {Object.entries(MATCH_METHOD).map(([k, v]) => (
              <option key={k} value={k}>
                {v} ({counts[k] || 0})
              </option>
            ))}
            <option value="none">Before audit ({counts.none || 0})</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ma-who">Staff member</label>
          <select id="ma-who" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Anyone</option>
            {Object.entries(people).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !shown.length ? (
        <p className="small">No payments here for {monthLabel(`${month}-01`)}.</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Received</th>
                <th scope="col">Tenancy</th>
                <th scope="col">From</th>
                <th scope="col" className="r">Amount</th>
                <th scope="col">Applied to</th>
                <th scope="col">How matched</th>
                <th scope="col">By</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>{shortDate(r.received_on)}</td>
                  <td>{r.tenancy ? tenancyAddress(r.tenancy) : "—"}</td>
                  <td>
                    {r.payer_name || "—"}
                    <span className="sub-line small">{methodText(r.method)}</span>
                  </td>
                  <td className="r num">{money(r.amount)}</td>
                  <td>{r.kind === "rent" && r.period ? monthLabel(r.period) : r.kind.replace(/_/g, " ")}</td>
                  <td>{matchLabel(r.match_method)}</td>
                  <td>
                    {r.matched_by ? people[r.matched_by] || "Staff" : r.match_method?.startsWith("auto") || r.match_method === "sender_rule" ? "Website" : "—"}
                    {r.matched_at ? <span className="sub-line small">{shortDate(String(r.matched_at).slice(0, 10))}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
