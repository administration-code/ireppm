"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { shortDate } from "@/lib/rent";
import { SITE } from "@/lib/site";
import { IRepMark } from "@/components/Brand";
import { contractorPay, monthLabel, statementFeeEntries, yearSummary } from "@/lib/contractor-pay";

const HST = 13;
const day = (ts) => shortDate(new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }));

// A partner's own pay: month by month, and a yearly statement for their taxes.
export default function AgentPay() {
  const { user, ready, openSignIn } = useAuth();
  const [state, setState] = useState({ loading: true, data: null });
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [openMonth, setOpenMonth] = useState("");

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    getBrowserClient()
      .rpc("my_partner_pay")
      .then(({ data }) => alive && setState({ loading: false, data }));
    return () => {
      alive = false;
    };
  }, [user]);

  if (!ready) return <p className="small">Loading…</p>;
  if (!user) {
    return (
      <div className="empty">
        <h1>Your Pay</h1>
        <p>Sign in with the email address IRep has on file for you.</p>
        <button type="button" className="btn primary" onClick={() => openSignIn("/agent/pay")}>
          Sign in
        </button>
      </div>
    );
  }
  if (state.loading) return <p className="small">Loading…</p>;
  const d = state.data;
  if (!d) {
    return (
      <div className="empty">
        <h1>Your Pay</h1>
        <p>
          We couldn&apos;t find a partner record for {user.email}. Contact <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
        </p>
      </div>
    );
  }

  const p = d.partner;
  const pct = Number(p.loan_share_pct || 0);
  const loanName = p.loan_name || "Loan";
  const loanLower = loanName.toLowerCase();
  const fees = statementFeeEntries(d.fees, p.leasing_fee_share, HST);
  const ledger = d.ledger || [];
  const pay = contractorPay(d.jobs || [], [...ledger, ...fees], pct);
  const loanSet = pay.loanSet;
  const years = [...new Set(pay.months.map((m) => Number(m.month.slice(0, 4))))];
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => b - a);
  const y = yearSummary(pay, year);
  const payments = ledger.filter((e) => e.kind === "payment" && String(e.entry_date).startsWith(`${year}-`));
  const name = p.company ? `${p.name} (${p.company})` : p.name;

  function print() {
    const old = document.title;
    document.title = `${p.name} - ${year} pay statement`;
    window.print();
    setTimeout(() => {
      document.title = old;
    }, 1000);
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="no-print" style={{ display: "grid", gap: 6 }}>
        <Link className="back" href="/agent">
          ← Agent Portal
        </Link>
        <span className="eyebrow">Agent Portal</span>
        <h1 className="admin-title">Your Pay</h1>
        <p className="small" style={{ margin: 0 }}>
          Work orders count at your price before HST (IRep keeps the HST it bills).
          {Number(p.leasing_fee_share) > 0 ? ` Leasing fees count at your ${Number(p.leasing_fee_share)}% share, before HST.` : ""}
          {pct > 0 ? ` ${pct}% of your leasing fees goes to your ${loanLower} until it's paid off.` : ""}
        </p>
      </div>

      <div className="rent-stats no-print">
        {[
          ["Owing to you now", pay.owed],
          ["Paid to you, all time", pay.totals.paid],
          ...(pct > 0 && loanSet ? [[`${loanName} balance`, pay.loanBalance]] : [["Earned, all time", pay.totals.earned + pay.totals.leasing]]),
          [`Earned in ${year}`, y.gross],
        ].map(([label, value]) => (
          <div key={label} className="stat">
            <span className="stat-label">{label}</span>
            <span className="stat-value num">{money(value)}</span>
          </div>
        ))}
      </div>

      <section className="boxed stack no-print" aria-labelledby="ap-months">
        <h2 id="ap-months" className="sec-title">
          By Month
        </h2>
        {pay.months.length ? (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className="num">
                    Work orders
                  </th>
                  <th scope="col" className="num">
                    Leasing fees
                  </th>
                  {pct > 0 ? (
                    <th scope="col" className="num">
                      To {loanLower}
                    </th>
                  ) : null}
                  <th scope="col" className="num">
                    Paid to you
                  </th>
                  <th scope="col" className="num">
                    Owing at month end
                  </th>
                </tr>
              </thead>
              <tbody>
                {pay.months.map((m) => {
                  const count = m.jobs.length + m.fees.length;
                  const open = openMonth === m.month;
                  return [
                    <tr key={m.month}>
                      <th scope="row">
                        <button type="button" className="linkish" onClick={() => setOpenMonth(open ? "" : m.month)} aria-expanded={open}>
                          {monthLabel(m.month)} {count ? `· ${count} item${count === 1 ? "" : "s"} ${open ? "▾" : "▸"}` : ""}
                        </button>
                      </th>
                      <td className="num">{m.earned ? money(m.earned) : "—"}</td>
                      <td className="num">{m.leasing ? money(m.leasing) : "—"}</td>
                      {pct > 0 ? <td className="num">{m.toLoan ? `−${money(m.toLoan)}` : "—"}</td> : null}
                      <td className="num">{m.paid ? `−${money(m.paid)}` : "—"}</td>
                      <td className="num">
                        <b>{money(m.owedAtEnd)}</b>
                      </td>
                    </tr>,
                    ...(open
                      ? [
                          ...m.jobs.map((j) => (
                            <tr key={j.id} className="muted-row">
                              <td colSpan={pct > 0 ? 6 : 5}>
                                <span className="small">
                                  {day(j.completed_at)} · {j.unit?.property?.address}
                                  {j.unit?.label && j.unit.label !== "Whole property" ? `, ${j.unit.label}` : ""}: {j.title} ·{" "}
                                  {money(j.partner_pay)}
                                </span>
                              </td>
                            </tr>
                          )),
                          ...m.fees.map((f) => (
                            <tr key={f.id} className="muted-row">
                              <td colSpan={pct > 0 ? 6 : 5}>
                                <span className="small">
                                  Leasing fee: {f.notes} · {money(f.amount)}
                                  {f.toLoan ? ` (${money(f.toLoan)} to ${loanLower})` : ""}
                                </span>
                              </td>
                            </tr>
                          )),
                        ]
                      : []),
                  ];
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small">Nothing yet.</p>
        )}
      </section>

      <section className="stack" aria-labelledby="ap-year">
        <div className="req-actions no-print" style={{ justifyContent: "space-between" }}>
          <h2 id="ap-year" className="sec-title" style={{ margin: 0 }}>
            Yearly Statement for Your Taxes
          </h2>
          <span className="req-actions">
            <label htmlFor="ap-y" className="visually-hidden">
              Year
            </label>
            <select id="ap-y" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((yy) => (
                <option key={yy} value={yy}>
                  {yy}
                </option>
              ))}
            </select>
            <button type="button" className="btn primary sm" onClick={print}>
              Print / Save as PDF
            </button>
          </span>
        </div>

        <article className="receipt letter" aria-label={`${year} pay statement`}>
          <header className="receipt-head">
            <div className="receipt-brand">
              <IRepMark />
              <span className="wm">
                <b>IREP</b>
                <i>PROPERTY MANAGEMENT</i>
              </span>
            </div>
            <address className="receipt-office">
              {SITE.name}
              <br />
              {SITE.address}
              <br />
              {SITE.phone}
              <br />
              {SITE.email}
            </address>
          </header>
          <div className="letter-meta">
            <p>
              <b>{name}</b>
            </p>
            <p>January 1 to December 31, {year}</p>
          </div>
          <h1 className="receipt-title">{year} Statement of Earnings</h1>

          <dl className="letter-summary">
            <div>
              <dt>Work orders (your price, before HST)</dt>
              <dd className="num">{money(y.earned)}</dd>
            </div>
            {y.leasing ? (
              <div>
                <dt>Leasing fees (your share, before HST)</dt>
                <dd className="num">{money(y.leasing)}</dd>
              </div>
            ) : null}
            {y.adjustments ? (
              <div>
                <dt>Adjustments</dt>
                <dd className="num">{money(y.adjustments)}</dd>
              </div>
            ) : null}
            <div className="letter-strong">
              <dt>Total earned</dt>
              <dd className="num">{money(y.gross)}</dd>
            </div>
            {pct > 0 && y.toLoan ? (
              <div>
                <dt>Applied to your {loanLower} (part of what you earned, not paid in cash)</dt>
                <dd className="num">{money(y.toLoan)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Paid to you in {year}</dt>
              <dd className="num">{money(y.paid)}</dd>
            </div>
            {y.owedAtEnd != null ? (
              <div>
                <dt>Still owed to you at year end</dt>
                <dd className="num">{money(y.owedAtEnd)}</dd>
              </div>
            ) : null}
            {pct > 0 && loanSet && y.loanAtEnd != null ? (
              <div>
                <dt>
                  {loanName} balance at year end
                </dt>
                <dd className="num">{money(Math.max(y.loanAtEnd, 0))}</dd>
              </div>
            ) : null}
          </dl>

          {y.months.length ? (
            <section className="letter-section">
              <h3 className="letter-h3">By Month</h3>
              <table className="letter-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="r">Work orders</th>
                    <th className="r">Leasing fees</th>
                    <th className="r">Paid to you</th>
                  </tr>
                </thead>
                <tbody>
                  {[...y.months].reverse().map((m) => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td>
                      <td className="r num">{money(m.earned)}</td>
                      <td className="r num">{money(m.leasing)}</td>
                      <td className="r num">{money(m.paid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {payments.length ? (
            <section className="letter-section">
              <h3 className="letter-h3">Payments to You</h3>
              <table className="letter-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Note</th>
                    <th className="r">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((e) => (
                    <tr key={e.id}>
                      <td>{shortDate(e.entry_date)}</td>
                      <td>{e.method || "—"}</td>
                      <td>{e.notes || "—"}</td>
                      <td className="r num">{money(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <p className="letter-note">
            Amounts are before HST. IRep did not withhold income tax from these amounts. Amounts applied to your {pct > 0 ? loanLower : "loan"} are
            part of what you earned. Keep this statement with your tax records.
          </p>
          <p className="receipt-note">Questions? Call {SITE.phone} or email {SITE.email}.</p>
        </article>
      </section>
    </div>
  );
}
