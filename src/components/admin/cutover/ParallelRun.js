"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { monthLabel, primaryTenant, tenancyAddress, thisMonth } from "@/lib/rent";
import CutoverTabs, { looseMatch, parsePasted } from "./CutoverTabs";

// What to compare, and how to get the portal's figure for each row.
const REPORTS = {
  rent_paid: { label: "Rent Roll: rent paid this month", hint: "Tenant (or address and unit), then the rent paid for the month." },
  rent_owing: { label: "Rent Roll: balance owing", hint: "Tenant (or address and unit), then what they owe (negative for a credit)." },
  remit: { label: "Owner Remittances: net to landlord", hint: "Property address, then the amount owed to the landlord for the month." },
  lmr: { label: "Deposits & Leasing: LMR received", hint: "Tenant (or address and unit), then the LMR received." },
  leasing: { label: "Deposits & Leasing: leasing fee", hint: "Property or tenant, then the leasing fee before HST." },
  payables: { label: "Chuck/Rishi Payables: commission owed", hint: "Chuck or Rishi, then the commission owed." },
};

async function portalRows(report, month) {
  const sb = getBrowserClient();
  const period = `${month}-01`;
  if (report === "rent_paid" || report === "rent_owing") {
    await sb.rpc("generate_rent_charges", { p_month: period });
    const [{ data: rc }, { data: bal }] = await Promise.all([
      sb
        .from("rent_collection")
        .select("tenancy_id, paid, tenancy:tenancies(id, unit:units(label, property:properties(address, city)), tenancy_tenants(full_name, is_primary, created_at))")
        .eq("period", period),
      report === "rent_owing" ? sb.from("tenancy_balances").select("tenancy_id, balance") : Promise.resolve({ data: [] }),
    ]);
    const balance = new Map((bal || []).map((b) => [b.tenancy_id, Number(b.balance)]));
    return (rc || []).map((r) => ({
      key: r.tenancy_id,
      label: `${primaryTenant(r.tenancy)} · ${tenancyAddress(r.tenancy)}`,
      text: `${(r.tenancy?.tenancy_tenants || []).map((p) => p.full_name).join(" ")} ${tenancyAddress(r.tenancy)}`,
      value: report === "rent_paid" ? Number(r.paid) : balance.get(r.tenancy_id) ?? 0,
    }));
  }
  if (report === "remit") {
    const { data } = await sb.from("owner_statement_totals").select("property_id, net_due, property:properties(address, city)").eq("period", period);
    return (data || []).map((r) => ({ key: r.property_id, label: r.property?.address, text: r.property?.address, value: Number(r.net_due) }));
  }
  if (report === "lmr" || report === "leasing") {
    const { data } = await sb.from("deposits_leasing").select("tenancy_id, address, unit, tenants, start_date, lmr_received, leasing_fee").gte("start_date", period);
    return (data || [])
      .filter((r) => (report === "lmr" ? Number(r.lmr_received) : Number(r.leasing_fee)))
      .map((r) => ({
        key: r.tenancy_id,
        label: `${r.tenants || ""} · ${[r.address, r.unit].filter(Boolean).join(", ")}`,
        text: `${r.tenants || ""} ${r.address} ${r.unit || ""}`,
        value: Number(report === "lmr" ? r.lmr_received : r.leasing_fee),
      }));
  }
  const { data } = await sb.rpc("leasing_commissions_summary", { p_year: Number(month.slice(0, 4)) });
  return (data?.loans || []).map((l) => ({ key: l.person, label: l.person, text: l.person, value: Number(l.commission_owed) }));
}

// Staff: paste the tracker's figures for a month and see where the portal differs.
export default function ParallelRun() {
  const [month, setMonth] = useState(thisMonth());
  const [report, setReport] = useState("rent_paid");
  const [paste, setPaste] = useState("");
  const [portal, setPortal] = useState(null);
  const [onlyDiff, setOnlyDiff] = useState(true);

  useEffect(() => {
    let alive = true;
    setPortal(null);
    portalRows(report, month).then((r) => alive && setPortal(r), () => alive && setPortal([]));
    return () => {
      alive = false;
    };
  }, [report, month]);

  const result = useMemo(() => {
    if (!portal) return null;
    const used = new Set();
    const lines = parsePasted(paste).map((l) => {
      const hits = portal.filter((p) => !used.has(p.key) && looseMatch(l.label, p.text));
      const hit = hits.length === 1 ? hits[0] : null;
      if (hit) used.add(hit.key);
      return { label: l.label, tracker: l.amount, portal: hit ? hit.value : null, match: hit?.label || (hits.length > 1 ? `${hits.length} possible matches` : "Not found in the portal") };
    });
    const missing = portal.filter((p) => !used.has(p.key) && Math.abs(p.value) > 0.004);
    const rows = [
      ...lines.map((l) => ({ ...l, diff: l.portal === null ? null : Math.round((l.portal - l.tracker) * 100) / 100 })),
      ...missing.map((p) => ({ label: "(not in the tracker)", tracker: null, portal: p.value, match: p.label, diff: null })),
    ];
    const differ = rows.filter((r) => r.diff === null || Math.abs(r.diff) > 0.004);
    const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    return { rows, differ, trackerTotal: sum("tracker"), portalTotal: sum("portal") };
  }, [portal, paste]);

  const shown = result ? (onlyDiff ? result.differ : result.rows) : [];

  return (
    <div className="stack" style={{ gap: 20 }}>
      <CutoverTabs
        title="Parallel Run"
        subtitle="Run the tracker and the portal side by side for a month: paste the tracker's figures and see every difference."
      />
      <div className="row3">
        <div className="field">
          <label htmlFor="pr-month">Month</label>
          <input id="pr-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pr-report">Compare</label>
          <select id="pr-report" value={report} onChange={(e) => setReport(e.target.value)}>
            {Object.entries(REPORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="pr-paste">Tracker figures ({REPORTS[report].hint})</label>
        <textarea id="pr-paste" rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Jane Smith\t1,650.00\n634 Tournier Unit 2\t1,200.00"} />
      </div>
      {result === null ? (
        <p className="small">Loading the portal&apos;s figures…</p>
      ) : paste.trim() ? (
        <section className="stack">
          <p className="small" style={{ margin: 0 }}>
            {monthLabel(`${month}-01`)}: tracker {money(result.trackerTotal)} · portal {money(result.portalTotal)} · difference{" "}
            <b>{money(result.portalTotal - result.trackerTotal)}</b> · {result.differ.length} {result.differ.length === 1 ? "line differs" : "lines differ"}
          </p>
          <label className="check-line">
            <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
            Show differences only
          </label>
          {shown.length ? (
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Tracker line</th>
                    <th scope="col">Portal match</th>
                    <th scope="col" className="r">Tracker</th>
                    <th scope="col" className="r">Portal</th>
                    <th scope="col" className="r">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={i}>
                      <td>{r.label}</td>
                      <td className="small">{r.match}</td>
                      <td className="r num">{r.tracker === null ? "—" : money(r.tracker)}</td>
                      <td className="r num">{r.portal === null ? "—" : money(r.portal)}</td>
                      <td className="r num">{r.diff === null ? "Check" : Math.abs(r.diff) > 0.004 ? <b>{money(r.diff)}</b> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="okbox">Everything matches.</div>
          )}
        </section>
      ) : (
        <p className="small">
          The portal has {portal.length} {portal.length === 1 ? "line" : "lines"} for this. Paste the tracker&apos;s figures above to compare.
        </p>
      )}
    </div>
  );
}
