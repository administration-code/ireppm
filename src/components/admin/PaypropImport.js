"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { parseCsv } from "@/lib/accounting";
import { loadTenancyOptions, primaryTenant, tenancyAddress } from "@/lib/rent";
import { refreshStaffCounts } from "@/lib/admin-nav";

// Imports PayProp's "All Payments" CSV (Reports → Payments). PayProp lists each tenant payment twice
// (IRep's fee share and the landlord's share) under the same ID, so rows are grouped by ID.
// Each saved payment gets reference "payprop:<DepRef>:<ID>", so re-importing skips it and the tenant's
// PayProp reference (DepRef) is remembered for next month's match.
const WEBSITE_START = "2026-10-01";
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const words = (s) => norm(s).split(" ").filter(Boolean);
const addrKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().split(/\s+/).slice(0, 2).join(" ");
const days = (a, b) => Math.abs(new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000;

function periodFor(date) {
  const d = new Date(`${date}T12:00:00`);
  if (d.getDate() >= 25) d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function readReport(text) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  if (!rows.length) throw new Error("That file is empty.");
  const head = rows[0].map((h) => h.trim());
  const col = (name) => head.indexOf(name);
  for (const need of ["ID", "PayorName", "PaidAmount", "BankStatementDate", "Property"])
    if (col(need) < 0) throw new Error(`This doesn't look like PayProp's All Payments report (no ${need} column).`);
  const byId = new Map();
  for (const r of rows.slice(1)) {
    const id = r[col("ID")]?.trim();
    if (!id || byId.has(id)) continue;
    const status = col("Status") >= 0 ? r[col("Status")] : "Paid";
    if (status && !/paid/i.test(status)) continue;
    byId.set(id, {
      id,
      date: r[col("BankStatementDate")]?.trim() || r[col("ReconDate")]?.trim(),
      payer: r[col("PayorName")]?.replace(/\s+/g, " ").trim(),
      amount: Number(r[col("PaidAmount")]),
      property: r[col("Property")]?.trim(),
      depRef: col("DepRef") >= 0 ? r[col("DepRef")]?.trim() : "",
    });
  }
  return [...byId.values()].filter((p) => p.date && p.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
}

function nameScore(payer, tenancy) {
  const p = words(payer);
  if (!p.length) return 0;
  let best = 0;
  for (const t of tenancy.tenancy_tenants || []) {
    const w = words(t.full_name);
    const hits = p.filter((x) => w.includes(x)).length;
    const sc = hits === p.length ? 3 : p[0] === w[0] && p[p.length - 1] === w[w.length - 1] ? 2.5 : hits >= 2 ? 2 : 0;
    best = Math.max(best, sc);
  }
  return best;
}

async function prepare(text) {
  const report = readReport(text);
  if (!report.length) throw new Error("No paid PayProp payments in that file.");
  const sb = getBrowserClient();
  const from = report[0].date;
  const [tenancies, { data: existing }] = await Promise.all([
    loadTenancyOptions({ includePast: true }),
    sb.from("payments").select("id, tenancy_id, amount, received_on, reference").eq("method", "payprop").gte("received_on", from),
  ]);
  const { data: learned } = await sb.from("payments").select("tenancy_id, reference").like("reference", "payprop:%").not("tenancy_id", "is", null);
  const refTenancy = new Map();
  for (const p of learned || []) {
    const dep = String(p.reference).split(":")[1];
    if (dep) refTenancy.set(dep, p.tenancy_id);
  }
  const used = new Set();
  const rows = report.map((p) => {
    const imported = (existing || []).find((e) => String(e.reference || "").endsWith(`:${p.id}`));
    let tenancyId = refTenancy.get(p.depRef) || tenancies.find((t) => p.depRef && t.payprop_reference === p.depRef)?.id || "";
    if (!tenancyId) {
      const atProperty = tenancies.filter((t) => addrKey(t.unit?.property?.address) === addrKey(p.property));
      const pool = atProperty.length ? atProperty : tenancies;
      let best = 0;
      for (const t of pool) {
        const sc = nameScore(p.payer, t) + (t.status === "ended" ? -0.5 : 0);
        if (sc > best) {
          best = sc;
          tenancyId = t.id;
        }
      }
      if (best < 2) tenancyId = atProperty.length === 1 ? atProperty[0].id : "";
    }
    const recorded =
      !imported && tenancyId
        ? (existing || []).find(
            (e) => !used.has(e.id) && !e.reference && e.tenancy_id === tenancyId && Math.abs(Number(e.amount) - p.amount) < 0.01 && days(e.received_on, p.date) <= 4
          )
        : null;
    if (recorded) used.add(recorded.id);
    const state = imported ? "imported" : recorded ? "recorded" : p.date < WEBSITE_START && periodFor(p.date) < WEBSITE_START ? "before" : "new";
    return { ...p, tenancyId, state, existingId: imported?.id || recorded?.id || null, pick: state === "new" && Boolean(tenancyId) };
  });
  return { rows, tenancies };
}

const STATE = {
  imported: ["Already imported", "pill st-available"],
  recorded: ["Already recorded", "pill st-available"],
  before: ["Before the website", "pill"],
  new: ["New", "pill st-draft"],
};

export default function PaypropImport({ onSaved }) {
  const [data, setData] = useState(null);
  const [file, setFile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load(f) {
    if (!f) return;
    setError("");
    setMsg("");
    setData(null);
    setFile(f.name);
    try {
      setData(await prepare(await f.text()));
    } catch (err) {
      setError(err.message || "We couldn't read that file.");
    }
  }

  const set = (i, changes) => setData((d) => ({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, ...changes } : r)) }));

  async function save() {
    const sb = getBrowserClient();
    const picked = data.rows.filter((r) => r.pick && r.tenancyId);
    const link = data.rows.filter((r) => r.state === "recorded" && r.existingId);
    setBusy(true);
    setError("");
    try {
      for (const r of link) await sb.from("payments").update({ reference: `payprop:${r.depRef}:${r.id}` }).eq("id", r.existingId);
      if (picked.length) {
        const { data: ins, error: err } = await sb
          .from("payments")
          .insert(
            picked.map((r) => ({
              tenancy_id: r.tenancyId,
              received_on: r.date,
              amount: Math.round(r.amount * 100) / 100,
              method: "payprop",
              kind: "rent",
              period: periodFor(r.date),
              payer_name: r.payer,
              reference: `payprop:${r.depRef}:${r.id}`,
              source: "payprop",
              notes: `PayProp report: ${r.property}`,
            }))
          )
          .select("id");
        if (err || ins?.length !== picked.length) throw new Error(err?.message?.includes("locked") ? err.message : "The import didn't save. Nothing new was recorded. Try again.");
      }
      refreshStaffCounts();
      setMsg(`Recorded ${picked.length} new PayProp payment${picked.length === 1 ? "" : "s"}${link.length ? ` and linked ${link.length} already recorded` : ""}.`);
      setData(null);
      setFile("");
      onSaved?.();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  const picked = data?.rows.filter((r) => r.pick && r.tenancyId).length || 0;

  return (
    <section className="boxed stack" aria-labelledby="pp-import" style={{ gap: 12 }}>
      <div>
        <h2 id="pp-import" className="sub-title">Import a PayProp Report</h2>
        <p className="small" style={{ margin: "4px 0 0" }}>
          In PayProp, export the All Payments report as a CSV for the month and choose it here. Payments already in the system are skipped, so it&apos;s safe to import the same report twice.
        </p>
      </div>
      <label className="btn ghost" style={{ justifySelf: "start", cursor: "pointer" }}>
        {file ? `Choose a different file (${file})` : "Choose the CSV file"}
        <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {error ? <div className="warnbox" role="alert">{error}</div> : null}
      {msg ? <div className="okbox" role="status">{msg}</div> : null}
      {data ? (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Record</th>
                  <th scope="col">Date</th>
                  <th scope="col">Paid by</th>
                  <th scope="col" className="r">Amount</th>
                  <th scope="col">Tenancy</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const [label, cls] = STATE[r.state];
                  const editable = r.state === "new" || r.state === "before";
                  return (
                    <tr key={r.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="row-check"
                          checked={r.pick}
                          disabled={!editable || !r.tenancyId}
                          onChange={(e) => set(i, { pick: e.target.checked })}
                          aria-label={`Record ${r.payer}'s payment`}
                        />
                      </td>
                      <td className="small">{r.date}</td>
                      <td>
                        <b>{r.payer}</b>
                        <span className="sub-line small">{r.property}{r.depRef ? ` · ${r.depRef}` : ""}</span>
                      </td>
                      <td className="r num">{money(r.amount)}</td>
                      <td>
                        {editable ? (
                          <select
                            aria-label={`Tenancy for ${r.payer}`}
                            value={r.tenancyId}
                            onChange={(e) => set(i, { tenancyId: e.target.value, pick: Boolean(e.target.value) })}
                          >
                            <option value="">Choose…</option>
                            {data.tenancies.map((t) => (
                              <option key={t.id} value={t.id}>
                                {primaryTenant(t)} · {tenancyAddress(t)}{t.status === "ended" ? " (ended)" : ""}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="small">{tenancyAddress(data.tenancies.find((t) => t.id === r.tenancyId))}</span>
                        )}
                      </td>
                      <td><span className={cls}>{label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.rows.some((r) => r.state === "before") ? (
            <p className="small" style={{ margin: 0 }}>
              Payments for months before the website started (October 2026) aren&apos;t ticked, because those months were settled outside the system. Tick any you want recorded anyway.
            </p>
          ) : null}
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn primary" disabled={busy} onClick={save}>
              {busy ? "Saving…" : picked ? `Record ${picked} payment${picked === 1 ? "" : "s"}` : "Link to what's already recorded"}
            </button>
            <button type="button" className="link-btn small" disabled={busy} onClick={() => { setData(null); setFile(""); }}>Cancel</button>
          </div>
        </>
      ) : null}
    </section>
  );
}
