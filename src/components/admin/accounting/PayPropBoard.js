"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { dollars, lastMonth, parseCsv } from "@/lib/accounting";
import AccountingTabs from "./AccountingTabs";

async function api(method, body, query = "") {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch(`/api/accounting/payprop${query}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "That didn't work.");
  return out;
}
const day = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "");
const STATUS = {
  matched: ["ok", "Matched"],
  date: ["ok", "Matched (date differs)"],
  month_total: ["ok", "Matches the month's total"],
  missing: ["bad", "Not in the portal"],
  unmatched: ["bad", "No payout recorded"],
  differs: ["bad", "Amount differs"],
  not_at_bank: ["bad", "Not at the bank yet"],
};
function Tag({ s }) {
  const [tone, label] = STATUS[s] || ["", s];
  return <span className={`tag ${tone === "ok" ? "tag-ok" : "tag-bad"}`}>{label}</span>;
}
function rowsFromCsv(text) {
  const rows = parseCsv(text);
  const head = rows.shift() || [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// Staff: match PayProp's "All Payments" export against the portal: tenant payments, landlord payouts,
// and IRep's PayProp deposits at Scotiabank.
export default function PayPropBoard() {
  const [month, setMonth] = useState(lastMonth());
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    setData(null);
    try {
      setData(await api("GET", null, `?month=${month}`));
    } catch (e) {
      setMsg(e.message);
    }
  }, [month]);
  useEffect(() => {
    load();
  }, [load]);

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const rows = rowsFromCsv(await file.text());
      const out = await api("POST", { rows });
      setMsg(`Imported ${out.lines} PayProp lines (${out.months.join(", ")}).`);
      await load();
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <AccountingTabs title="PayProp" subtitle="Upload PayProp's All Payments export each month. The portal matches it to rent payments, landlord payouts and PayProp's deposits at the bank." />
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <label className="field">
          <span>Month</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="btn sm">
          {busy ? "Importing…" : "Upload All Payments CSV"}
          <input type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        <span className="small">In PayProp: Reports → All Payments, the whole month, no filters. Upload the month before too, so payouts made early in the month are complete.</span>
      </div>
      {msg ? <p className="small" role="status">{msg}</p> : null}
      {!data ? (
        <p className="small">Loading…</p>
      ) : !data.lines ? (
        <p className="small">No PayProp lines for this month yet. Upload the export.</p>
      ) : (
        <>
          {data.unmappedProperties.length ? (
            <p className="small err">Couldn&apos;t match these PayProp properties to a property in the portal: {data.unmappedProperties.join(", ")}.</p>
          ) : null}

          <section className="boxed stack">
            <h2 className="sec-title">
              Tenant Payments {data.counts.tenantIssues ? <span className="tab-count">{data.counts.tenantIssues}</span> : null}
            </h2>
            <table className="acct-table">
              <thead>
                <tr><th>PayProp date</th><th>Property</th><th>Tenant</th><th className="num">Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.tenant.map((t, i) => (
                  <tr key={i}>
                    <td>{day(t.date)}</td>
                    <td>{t.property}</td>
                    <td>
                      {t.payor}
                      {t.portal && t.portal.payer && t.portal.payer !== t.payor ? <span className="small"> (portal: {t.portal.payer})</span> : null}
                    </td>
                    <td className="num">{dollars(t.amount)}</td>
                    <td>
                      <Tag s={t.status} />
                      {t.status === "date" ? <span className="small"> portal {day(t.portal.date)}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.portalOnly.length ? (
              <>
                <h3 className="sub-title">In the portal as PayProp, but not in PayProp&apos;s export</h3>
                <ul className="small">
                  {data.portalOnly.map((p) => (
                    <li key={p.id}>
                      {day(p.date)} · {p.property} · {p.payer || "tenant"} · {dollars(p.amount)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="boxed stack">
            <h2 className="sec-title">
              Landlord Payouts {data.counts.payoutIssues ? <span className="tab-count">{data.counts.payoutIssues}</span> : null}
            </h2>
            <table className="acct-table">
              <thead>
                <tr><th>Paid by PayProp</th><th>Property</th><th>Landlord</th><th className="num">PayProp</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.payouts.map((p, i) => (
                  <tr key={i}>
                    <td>{day(p.date)}</td>
                    <td>{p.property}</td>
                    <td>{p.payee}</td>
                    <td className="num">{dollars(p.amount)}</td>
                    <td>
                      <Tag s={p.status} />
                      {p.status === "date" ? <span className="small"> portal {day(p.portal.date)}</span> : null}
                      {p.status === "differs" ? <span className="small"> portal {dollars(p.portal.total)} ({p.difference > 0 ? "+" : ""}{dollars(p.difference)})</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.payoutsPortalOnly.length ? (
              <>
                <h3 className="sub-title">PayProp payouts in the portal with nothing in PayProp&apos;s export</h3>
                <ul className="small">
                  {data.payoutsPortalOnly.map((p) => (
                    <li key={p.id}>
                      {day(p.date)} · {p.property} · {dollars(p.amount)}
                    </li>
                  ))}
                </ul>
                <p className="small">Often these are paid from tenant payments made the month before. Upload that month&apos;s export too.</p>
              </>
            ) : null}
          </section>

          <section className="boxed stack">
            <h2 className="sec-title">
              IRep&apos;s PayProp Deposits {data.counts.irepIssues ? <span className="tab-count">{data.counts.irepIssues}</span> : null}
            </h2>
            <table className="acct-table">
              <thead>
                <tr><th>Paid by PayProp</th><th>Remittance</th><th className="num">Fees in export</th><th>At the bank</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.irep.map((f) => (
                  <tr key={f.remit}>
                    <td>{day(f.date)}</td>
                    <td>{f.remit}</td>
                    <td className="num">{dollars(f.amount)}</td>
                    <td>{f.bank ? `${day(f.bank.date)} · ${dollars(f.bank.amount)}` : "—"}</td>
                    <td>
                      <Tag s={f.status} />
                      {f.difference != null ? <span className="small"> {f.difference > 0 ? "+" : ""}{dollars(f.difference)}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small">
              A PayProp deposit can include fees from payments made the month before, and PayProp&apos;s own charges. Upload the previous month&apos;s export so every remittance is complete.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
