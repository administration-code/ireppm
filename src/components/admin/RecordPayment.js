"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import {
  METHOD_LABEL,
  PAYMENT_KIND_LABEL,
  checkAmount,
  countUnmatched,
  methodText,
  monthLabel,
  shortDate,
  loadTenancyOptions,
  periodOf,
  primaryTenant,
  recordFirstAndLast,
  todayISO,
} from "@/lib/rent";
import RentNav, { RentHead } from "./RentNav";
import TenancyPicker from "./TenancyPicker";

const blank = (tenancyId = "") => ({
  tenancyId,
  date: todayISO(),
  amount: "",
  method: "cash",
  kind: "rent",
  month: "",
  payer: "",
  receivedBy: "",
  notes: "",
  first: "",
  firstMonth: "",
  last: "",
  key: "",
});

const splitTotalOf = (f) => ["first", "last", "key"].reduce((sum, k) => sum + (Number(f[k]) || 0), 0);
const SOURCE = { interac_email: "e-Transfer email", manual: "Entered by hand", import: "Tracker import", payprop: "PayProp" };

const num = (v) => (v === null || v === undefined || v === "" ? "" : String(Number(v)));

export default function RecordPayment({ tenancyId = "" }) {
  const [tenancies, setTenancies] = useState([]);
  const [unmatched, setUnmatched] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(() => blank(tenancyId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const [history, setHistory] = useState(null); // { paid: [...], waiting: [...] } for the chosen tenancy
  const [dupOk, setDupOk] = useState(false); // "Save Anyway" after a possible duplicate

  useEffect(() => {
    let alive = true;
    Promise.all([loadTenancyOptions({ rentOnly: true }), countUnmatched()]).then(
      ([list, count]) => {
        if (!alive) return;
        setTenancies(list);
        setUnmatched(count);
      },
      (err) => alive && setLoadError(err.message)
    );
    return () => {
      alive = false;
    };
  }, []);

  // Payments already recorded for the chosen tenancy, so nothing gets entered twice.
  useEffect(() => {
    setDupOk(false);
    if (!form.tenancyId) return setHistory(null);
    let alive = true;
    const sb = getBrowserClient();
    const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    Promise.all([
      sb
        .from("payments")
        .select("id, received_on, amount, method, kind, period, source, payer_name, reference, parent_id")
        .eq("tenancy_id", form.tenancyId)
        .neq("status", "ignored")
        .gte("received_on", since)
        .order("received_on", { ascending: false })
        .limit(15),
      sb
        .from("payments")
        .select("id, received_on, amount, method, payer_name")
        .eq("suggested_tenancy_id", form.tenancyId)
        .is("tenancy_id", null)
        .eq("status", "unmatched")
        .order("received_on", { ascending: false })
        .limit(5),
    ]).then(([p, w]) => alive && setHistory({ paid: p.data || [], waiting: w.data || [] }));
    return () => {
      alive = false;
    };
  }, [form.tenancyId, saved]);

  // Same amount within 7 days of the date received: probably already recorded.
  const amountNow = form.kind === "first_last" ? splitTotalOf(form) : Number(form.amount) || 0;
  const near = (d) => form.date && Math.abs(Date.parse(d) - Date.parse(form.date)) <= 7 * 86400000;
  const possibleDupes = (history ? [...history.paid, ...history.waiting] : []).filter(
    (p) => amountNow > 0 && near(p.received_on) && Math.round(Number(p.amount) * 100) === Math.round(amountNow * 100)
  );

  const set = (key) => (e) => {
    setDupOk(false);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };
  const firstLast = form.kind === "first_last";
  const splitTotal = splitTotalOf(form);

  // First and last: fill the split from the tenancy (rent, last month's deposit, key deposit, start month).
  function fillSplit(tenancyId, kind) {
    setDupOk(false);
    const t = tenancies.find((x) => x.id === (tenancyId ?? form.tenancyId));
    setForm((f) => ({
      ...f,
      ...(tenancyId !== undefined ? { tenancyId } : {}),
      ...(kind !== undefined ? { kind } : {}),
      ...((kind ?? f.kind) === "first_last" && t
        ? {
            first: num(t.rent),
            last: num(t.last_month_deposit || t.rent),
            key: num(t.key_deposit),
            firstMonth: String(t.start_date || "").slice(0, 7),
          }
        : {}),
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.tenancyId) return setError("Choose the tenancy this payment is for.");
    if (!form.date) return setError("Add the date the payment was received.");
    if (possibleDupes.length && !dupOk) {
      setDupOk(true);
      return setError(
        `This looks like it's already recorded: ${possibleDupes
          .map((p) => `${money(p.amount)} on ${shortDate(p.received_on)}`)
          .join(", ")}. Check the list below. If it really is a separate payment, click Save Anyway.`
      );
    }
    if (firstLast) {
      if (!(Number(form.first) > 0) && !(Number(form.last) > 0)) return setError("Add the first month's rent and the last month's deposit.");
      const bad = ["first", "last", "key"].map((k) => (form[k] ? checkAmount(form[k]) : "")).find(Boolean);
      if (bad) return setError(bad);
      if (Number(form.first) > 0 && !form.firstMonth) return setError("Choose which month the first month's rent is for.");
      setBusy(true);
      try {
        const rows = await recordFirstAndLast({
          tenancyId: form.tenancyId, date: form.date, method: form.method, payer: form.payer, receivedBy: form.receivedBy,
          notes: form.notes, firstAmount: form.first, firstPeriod: form.firstMonth, lastAmount: form.last, keyAmount: form.key,
        });
        const t = tenancies.find((x) => x.id === form.tenancyId);
        const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
        setSaved({ id: rows[0]?.id, text: `Saved first and last from ${t ? primaryTenant(t) : "the tenant"}: ${money(total)} in ${rows.length} parts.` });
        setForm(blank());
      } catch (err) {
        setError(err.message);
      }
      setBusy(false);
      return;
    }
    const problem = checkAmount(form.amount);
    if (problem) return setError(problem);

    setBusy(true);
    const { data, error: insError } = await getBrowserClient()
      .from("payments")
      .insert({
        tenancy_id: form.tenancyId,
        received_on: form.date,
        amount: Math.round(Number(form.amount) * 100) / 100,
        method: form.method,
        kind: form.kind,
        period: periodOf(form.month),
        payer_name: form.payer.trim() || null,
        received_by: form.method === "cash" ? form.receivedBy.trim() || null : null,
        notes: form.notes.trim() || null,
        source: "manual",
      })
      .select("id, amount")
      .single();
    setBusy(false);
    if (insError || !data) return setError("That payment didn't save. Try again.");
    const t = tenancies.find((x) => x.id === form.tenancyId);
    setSaved({ id: data.id, text: `Saved ${money(data.amount)} from ${t ? primaryTenant(t) : "the tenant"}.` });
    setForm(blank());
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <RentHead title="Record a Payment" intro="For cash, cheques, direct deposits and anything that didn't arrive by e-Transfer email." />
      <RentNav current="/admin/rent/new" unmatched={unmatched} />

      {loadError ? <div className="warnbox">{loadError}</div> : null}
      {saved ? (
        <div className="okbox" role="status">
          {saved.text} <Link href={`/admin/rent/receipt?payment=${saved.id}`}>View receipt</Link>
        </div>
      ) : null}

      <form className="boxed stack admin-form" onSubmit={submit} noValidate aria-label="Record a payment">
        <TenancyPicker
          id="rp-tenancy"
          tenancies={tenancies}
          value={form.tenancyId}
          onChange={(v) => fillSplit(v)}
        />
        <div className="row3">
          <div className="field">
            <label htmlFor="rp-date">Date received</label>
            <input id="rp-date" type="date" value={form.date} onChange={set("date")} />
          </div>
          <div className="field">
            <label htmlFor="rp-amount">Amount</label>
            {firstLast ? (
              <input id="rp-amount" value={splitTotal ? money(splitTotal) : ""} readOnly aria-describedby="rp-amount-hint" />
            ) : (
              <input id="rp-amount" inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="1850" />
            )}
            {firstLast ? (
              <span id="rp-amount-hint" className="small">
                Total of the parts below.
              </span>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="rp-method">Method</label>
            <select id="rp-method" value={form.method} onChange={set("method")}>
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row3">
          <div className="field">
            <label htmlFor="rp-kind">What it&apos;s for</label>
            <select id="rp-kind" value={form.kind} onChange={(e) => fillSplit(undefined, e.target.value)}>
              {Object.entries(PAYMENT_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
              <option value="first_last">First and last (move-in)</option>
            </select>
          </div>
          {firstLast ? null : (
            <div className="field">
              <label htmlFor="rp-month">Rent month</label>
              <input id="rp-month" type="month" value={form.month} onChange={set("month")} aria-describedby="rp-month-hint" />
              <span id="rp-month-hint" className="small">
                Leave blank and it goes to the oldest month still owing (or the month received; on or after the 25th, next month).
              </span>
            </div>
          )}
          <div className="field">
            <label htmlFor="rp-payer">Payer name (optional)</label>
            <input id="rp-payer" value={form.payer} onChange={set("payer")} />
          </div>
        </div>
        {firstLast ? (
          <fieldset className="boxed first-last stack">
            <legend>First and Last</legend>
            <p className="small">Saved as separate records: the first month&apos;s rent counts toward that month; the deposits are held, not counted as rent.</p>
            <div className="row4">
              <div className="field">
                <label htmlFor="rp-first">First month&apos;s rent</label>
                <input id="rp-first" inputMode="decimal" value={form.first} onChange={set("first")} />
              </div>
              <div className="field">
                <label htmlFor="rp-first-month">For month</label>
                <input id="rp-first-month" type="month" value={form.firstMonth} onChange={set("firstMonth")} />
              </div>
              <div className="field">
                <label htmlFor="rp-last">Last month&apos;s rent deposit</label>
                <input id="rp-last" inputMode="decimal" value={form.last} onChange={set("last")} />
              </div>
              <div className="field">
                <label htmlFor="rp-key">Key deposit (optional)</label>
                <input id="rp-key" inputMode="decimal" value={form.key} onChange={set("key")} />
              </div>
            </div>
          </fieldset>
        ) : null}
        {form.method === "cash" ? (
          <div className="field">
            <label htmlFor="rp-by">Cash received by</label>
            <input id="rp-by" value={form.receivedBy} onChange={set("receivedBy")} placeholder="e.g. Chuck" />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="rp-notes">Notes (optional)</label>
          <textarea id="rp-notes" rows={2} value={form.notes} onChange={set("notes")} />
        </div>
        {error ? (
          <div className="warnbox" role="alert">
            {error}
          </div>
        ) : null}
        <div className="req-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : dupOk && possibleDupes.length ? "Save Anyway" : "Save Payment"}
          </button>
        </div>
      </form>

      {form.tenancyId ? <RecordedHistory history={history} dupes={possibleDupes} /> : null}
    </div>
  );
}

function RecordedHistory({ history, dupes }) {
  const flagged = new Set(dupes.map((d) => d.id));
  return (
    <section className="boxed stack" aria-labelledby="rp-history">
      <h2 id="rp-history" className="sec-title">
        Already Recorded for This Tenancy
      </h2>
      {history === null ? (
        <p className="small">Loading…</p>
      ) : (
        <>
          {history.waiting.length ? (
            <div className="warnbox">
              {history.waiting.length === 1 ? "An e-Transfer that looks like this tenant's is" : `${history.waiting.length} e-Transfers that look like this tenant's are`} waiting
              on the To Match page:{" "}
              {history.waiting.map((w) => `${money(w.amount)} on ${shortDate(w.received_on)}${w.payer_name ? ` from ${w.payer_name}` : ""}`).join("; ")}.{" "}
              <Link href="/admin/rent/match">Match it there</Link> instead of recording it again.
            </div>
          ) : null}
          {!history.paid.length ? (
            <p className="small">Nothing recorded in the last 12 months.</p>
          ) : (
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Received</th>
                    <th scope="col" className="r">
                      Amount
                    </th>
                    <th scope="col">For</th>
                    <th scope="col">Method</th>
                    <th scope="col">How it got here</th>
                  </tr>
                </thead>
                <tbody>
                  {history.paid.map((p) => (
                    <tr key={p.id} className={flagged.has(p.id) ? "attention" : undefined}>
                      <td>
                        {shortDate(p.received_on)}
                        {flagged.has(p.id) ? <span className="small sub-line">⚠ Same amount, close date</span> : null}
                      </td>
                      <td className="r num">{money(p.amount)}</td>
                      <td>
                        {PAYMENT_KIND_LABEL[p.kind] || p.kind}
                        {p.period ? <span className="small sub-line">{monthLabel(p.period)}</span> : null}
                      </td>
                      <td>{methodText(p.method)}</td>
                      <td className="small">
                        {SOURCE[p.source] || p.source}
                        {p.payer_name ? <span className="sub-line">{p.payer_name}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small" style={{ margin: 0 }}>
            Last 12 months, newest first.
          </p>
        </>
      )}
    </section>
  );
}
