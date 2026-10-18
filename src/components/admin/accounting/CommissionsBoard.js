"use client";

import { Fragment, useCallback, useEffect, useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import {
  PAY_METHOD_LABEL,
  dollars,
  downloadCsv,
  monthOnly,
  parseAmount,
  staffMessage,
} from "@/lib/accounting";
import { monthLabel, shortDate, todayISO } from "@/lib/rent";
import YearSelect from "@/components/YearSelect";
import AccountingTabs from "./AccountingTabs";

const n = (v) => Number(v || 0);
const m2 = (v) => n(v).toFixed(2);
const same = (a, b) => Math.round(n(a) * 100) === Math.round(n(b) * 100);
const periodKey = (p) => (p ? String(p).slice(0, 7) : "");

async function loadAll(year) {
  const sb = getBrowserClient();
  const [summary, payments] = await Promise.all([
    sb.rpc("leasing_commissions_summary", { p_year: year }),
    sb
      .from("commission_payments")
      .select("id, person, paid_on, period, amount, method, note")
      .gte("paid_on", `${year}-01-01`)
      .lte("paid_on", `${year}-12-31`)
      .order("paid_on"),
  ]);
  if (summary.error) throw new Error(staffMessage(summary.error, "We couldn't load commissions. Refresh the page to try again."));
  return { ...summary.data, payments: payments.data || [] };
}

export default function CommissionsBoard({ year: yearProp }) {
  const year = yearProp || Number(todayISO().slice(0, 4));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      setData(await loadAll(year));
    } catch (err) {
      setError(err.message);
    }
  }, [year]);

  useEffect(() => {
    setData(null);
    refresh();
  }, [refresh]);

  function exportYear() {
    downloadCsv(
      `irep-${year}-leasing-split.csv`,
      [
        "month", "leasing_fees_before_hst", "hst", "rishi_commission", "chuck_commission", "rishi_loan_share",
        "chuck_loan_share", "rishi_commission_paid", "chuck_commission_paid", "rishi_loan_repaid", "chuck_loan_repaid",
      ],
      data.months.map((m) => [
        periodKey(m.period), m2(m.fees), m2(m.hst), m2(m.rishi_commission), m2(m.chuck_commission), m2(m.rishi_loan),
        m2(m.chuck_loan), m2(m.rishi_commission_paid), m2(m.chuck_commission_paid), m2(m.rishi_loan_repaid), m2(m.chuck_loan_repaid),
      ])
    );
    setTimeout(() => {
      downloadCsv(
        `irep-${year}-commission-payments.csv`,
        ["person", "paid_on", "month", "amount", "method", "note"],
        data.payments.map((p) => [p.person, p.paid_on, periodKey(p.period), m2(p.amount), PAY_METHOD_LABEL[p.method] || p.method, p.note || ""])
      );
    }, 400);
  }

  return (
    <div className="stack">
      <AccountingTabs title="Commissions & Loans" subtitle="The leasing fee split and the shareholder loans.">
        <div className="acct-inline-actions">
          <YearSelect year={year} />
          <button type="button" className="btn ghost" onClick={exportYear} disabled={!data}>
            Download CSV
          </button>
        </div>
      </AccountingTabs>

      <p className="acct-rule">
        Each leasing fee, before HST, is split 50/50 between Rishi and Chuck. Half of each share is paid as commission;
        the other half repays that person&apos;s shareholder loan. HST is never split: it&apos;s owed to CRA.
      </p>

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {!data && !error ? <p className="small">Loading…</p> : null}

      {data ? (
        <>
          <div className="acct-loans">
            {data.loans.map((loan) => (
              <LoanCard key={loan.id} loan={loan} onChange={refresh} />
            ))}
          </div>
          <MonthsTable data={data} year={year} onChange={refresh} />
          <SplitsList splits={data.splits} />
          <PaymentsList payments={data.payments} year={year} onChange={refresh} />
        </>
      ) : null}
    </div>
  );
}

function LoanCard({ loan, onChange }) {
  const id = useId();
  const pct = n(loan.advanced) > 0 ? Math.min(100, Math.max(0, (n(loan.repaid) / n(loan.advanced)) * 100)) : 0;
  const [f, setF] = useState({ paid_on: todayISO(), amount: "", note: "" });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function add(e) {
    e.preventDefault();
    setError("");
    const amount = parseAmount(f.amount);
    if (amount == null || amount <= 0) return setError("Enter an amount above zero.");
    if (!f.paid_on) return setError("Choose the date.");
    setBusy(true);
    const { error: err } = await getBrowserClient()
      .from("loan_repayments")
      .insert({ loan_id: loan.id, paid_on: f.paid_on, amount: Math.abs(amount), note: f.note.trim() || null });
    setBusy(false);
    if (err) return setError(staffMessage(err));
    setF({ paid_on: todayISO(), amount: "", note: "" });
    setOpen(false);
    onChange();
  }

  async function remove(r) {
    if (!window.confirm(`Delete the ${dollars(r.amount)} repayment on ${shortDate(r.paid_on)}?`)) return;
    setError("");
    const { error: err } = await getBrowserClient().from("loan_repayments").delete().eq("id", r.id);
    if (err) return setError(staffMessage(err, "That didn't delete. Try again."));
    onChange();
  }

  return (
    <section className="boxed stack" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="sec-title">
        {loan.label}
      </h2>
      <div className="acct-sums">
        <div>
          <span className="small">Advanced</span>
          <b>{dollars(loan.advanced)}</b>
        </div>
        <div>
          <span className="small">Repaid so far</span>
          <b>{dollars(loan.repaid)}</b>
        </div>
        <div>
          <span className="small">Remaining</span>
          <b>{dollars(loan.remaining)}</b>
        </div>
      </div>
      <div
        className="acct-bar"
        role="progressbar"
        aria-label={`${loan.label} repaid`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={`${Math.round(pct)}% repaid`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="small">{Math.round(pct)}% repaid</p>

      {loan.repayments.length ? (
        <ul className="acct-mini-list">
          {loan.repayments.map((r) => (
            <li key={r.id}>
              <span className="acct-line-date">{shortDate(r.paid_on)}</span>
              <span className="acct-line-main">
                <span>{r.period ? `Leasing fees, ${monthLabel(r.period)}` : "Repayment"}</span>
                {r.note ? <span className="acct-line-sub">{r.note}</span> : null}
              </span>
              <span className="acct-mini-end">
                <b>{dollars(r.amount)}</b>
                <button type="button" className="linkbtn" onClick={() => remove(r)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">No repayments yet.</p>
      )}

      {open ? (
        <form className="acct-inline-form" onSubmit={add}>
          <div className="acct-map-grid">
            <div className="field">
              <label htmlFor={`${id}-date`}>Date</label>
              <input id={`${id}-date`} type="date" value={f.paid_on} onChange={set("paid_on")} required />
            </div>
            <div className="field">
              <label htmlFor={`${id}-amt`}>Amount</label>
              <input id={`${id}-amt`} inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="0.00" required />
            </div>
            <div className="field">
              <label htmlFor={`${id}-note`}>Note</label>
              <input id={`${id}-note`} value={f.note} onChange={set("note")} />
            </div>
          </div>
          <div className="acct-inline-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Add repayment"}
            </button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
            Add a repayment
          </button>
        </div>
      )}
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function isPaid(m) {
  return (
    same(m.rishi_commission_paid, m.rishi_commission) &&
    same(m.chuck_commission_paid, m.chuck_commission) &&
    same(m.rishi_loan_repaid, m.rishi_loan) &&
    same(m.chuck_loan_repaid, m.chuck_loan)
  );
}

function paidDateFor(period, data) {
  const key = periodKey(period);
  const dates = [
    ...data.payments.filter((p) => periodKey(p.period) === key).map((p) => p.paid_on),
    ...data.loans.flatMap((l) => l.repayments.filter((r) => periodKey(r.period) === key).map((r) => r.paid_on)),
  ].sort();
  return dates[dates.length - 1] || null;
}

const MONTH_COLS = [
  ["fees", "Leasing fees (before HST)"],
  ["hst", "HST"],
  ["rishi_commission", "Rishi commission"],
  ["chuck_commission", "Chuck commission"],
  ["rishi_loan", "Rishi loan share"],
  ["chuck_loan", "Chuck loan share"],
];

function MonthsTable({ data, year, onChange }) {
  const [paying, setPaying] = useState(null);
  return (
    <section className="boxed stack" aria-labelledby="comm-months">
      <h2 id="comm-months" className="sec-title">
        By Month
      </h2>
      <div className="ly-table-wrap">
        <table className="acct-st">
          <thead>
            <tr>
              <th scope="col">Month</th>
              {MONTH_COLS.map(([k, label]) => (
                <th key={k} scope="col" className="num">
                  {label}
                </th>
              ))}
              <th scope="col">Paid?</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => {
              const hasFees = n(m.fees) > 0;
              const paid = hasFees && isPaid(m);
              const when = paid ? paidDateFor(m.period, data) : null;
              const key = periodKey(m.period);
              return (
                <Fragment key={key}>
                  <tr>
                    <th scope="row">{monthOnly(m.period)}</th>
                    {MONTH_COLS.map(([k]) => (
                      <td key={k} className="num">
                        {dollars(m[k])}
                      </td>
                    ))}
                    <td>
                      {!hasFees ? (
                        <span className="small">—</span>
                      ) : paid ? (
                        <span className="acct-tag is-cleared">Paid {when ? shortDate(when) : ""}</span>
                      ) : paying === key ? null : (
                        <button type="button" className="btn ghost btn-sm" onClick={() => setPaying(key)}>
                          Record as paid
                        </button>
                      )}
                    </td>
                  </tr>
                  {paying === key ? (
                    <tr>
                      <td colSpan={MONTH_COLS.length + 2}>
                        <PayForm
                          period={String(m.period).slice(0, 10)}
                          onCancel={() => setPaying(null)}
                          onDone={() => {
                            setPaying(null);
                            onChange();
                          }}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{year} total</th>
              {MONTH_COLS.map(([k]) => (
                <td key={k} className="num">
                  {dollars(data.months.reduce((s, m) => s + n(m[k]), 0))}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function PayForm({ period, onCancel, onDone }) {
  const id = useId();
  const [f, setF] = useState({ paid_on: todayISO(), method: "etransfer", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await getBrowserClient().rpc("pay_leasing_split", {
      p_period: period,
      p_paid_on: f.paid_on,
      p_method: f.method,
      p_note: f.note.trim() || null,
    });
    setBusy(false);
    if (err) return setError(staffMessage(err, "That didn't save. Try again."));
    onDone();
  }

  return (
    <form className="acct-inline-form" onSubmit={submit} aria-label={`Record ${monthLabel(period)} as paid`}>
      <p className="small">
        Records each person&apos;s {monthLabel(period)} commission and loan share as paid on this date.
      </p>
      <div className="acct-map-grid">
        <div className="field">
          <label htmlFor={`${id}-date`}>Date paid</label>
          <input id={`${id}-date`} type="date" value={f.paid_on} onChange={set("paid_on")} required />
        </div>
        <div className="field">
          <label htmlFor={`${id}-method`}>Method</label>
          <select id={`${id}-method`} value={f.method} onChange={set("method")}>
            {Object.entries(PAY_METHOD_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-note`}>Note</label>
          <input id={`${id}-note`} value={f.note} onChange={set("note")} />
        </div>
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      <div className="acct-inline-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Record as paid"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SplitsList({ splits }) {
  return (
    <details className="boxed">
      <summary className="sec-title">Fees ({splits.length})</summary>
      {splits.length ? (
        <div className="ly-table-wrap" style={{ marginTop: 12 }}>
          <table className="acct-st">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Property</th>
                <th scope="col">Description</th>
                <th scope="col" className="num">Fee</th>
                <th scope="col" className="num">HST</th>
                <th scope="col" className="num">Rishi commission</th>
                <th scope="col" className="num">Chuck commission</th>
                <th scope="col" className="num">Rishi loan</th>
                <th scope="col" className="num">Chuck loan</th>
              </tr>
            </thead>
            <tbody>
              {splits.map((s) => (
                <tr key={s.statement_item_id}>
                  <td>{monthLabel(s.period)}</td>
                  <td>{s.address}</td>
                  <td>{s.description || "Leasing fee"}</td>
                  <td className="num">{dollars(s.fee)}</td>
                  <td className="num">{dollars(s.hst)}</td>
                  <td className="num">{dollars(s.rishi_commission)}</td>
                  <td className="num">{dollars(s.chuck_commission)}</td>
                  <td className="num">{dollars(s.rishi_loan)}</td>
                  <td className="num">{dollars(s.chuck_loan)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small" style={{ marginTop: 12 }}>
          No leasing fees this year.
        </p>
      )}
    </details>
  );
}

function PaymentsList({ payments, year, onChange }) {
  const [error, setError] = useState("");

  async function remove(p) {
    if (!window.confirm(`Delete ${p.person}'s ${dollars(p.amount)} payment on ${shortDate(p.paid_on)}?`)) return;
    setError("");
    const { error: err } = await getBrowserClient().from("commission_payments").delete().eq("id", p.id);
    if (err) return setError(staffMessage(err, "That didn't delete. Try again."));
    onChange();
  }

  return (
    <section className="boxed stack" aria-labelledby="comm-payments">
      <h2 id="comm-payments" className="sec-title">
        Commission Payments
      </h2>
      {payments.length ? (
        <ul className="acct-mini-list">
          {payments.map((p) => (
            <li key={p.id}>
              <span className="acct-line-date">{shortDate(p.paid_on)}</span>
              <span className="acct-line-main">
                <span>
                  <b>{p.person}</b>
                  {p.period ? ` · ${monthLabel(p.period)}` : ""} · {PAY_METHOD_LABEL[p.method] || p.method}
                </span>
                {p.note ? <span className="acct-line-sub">{p.note}</span> : null}
              </span>
              <span className="acct-mini-end">
                <b>{dollars(p.amount)}</b>
                <button type="button" className="linkbtn" onClick={() => remove(p)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">No commission payments in {year}.</p>
      )}
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
