"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { checkAmount, cents, shortDate } from "@/lib/rent";
import { DEFAULT_HST_PERCENT } from "@/lib/admin-properties";
import { JOB_SELECT, LEDGER_KIND_LABEL, PAY_METHODS, contractorPay, monthLabel } from "@/lib/contractor-pay";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const CHARGE_LABEL = { owner: "Owner", tenant: "Tenant", irep: "IRep" };
const feeLabel = (d) => String(d || "").replace(/^Leasing fee:\s*/i, "");

async function load(id) {
  const sb = getBrowserClient();
  const [partner, jobs, ledger] = await Promise.all([
    sb.from("partners").select("id, name, company, loan_share_pct, loan_name").eq("id", id).maybeSingle(),
    sb.from("maintenance_requests").select(JOB_SELECT).eq("partner_id", id).eq("status", "completed").order("completed_at", { ascending: false }),
    sb.from("partner_ledger").select("*").eq("partner_id", id).order("entry_date", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  if (partner.error || jobs.error || ledger.error) throw new Error("load");
  return { partner: partner.data, jobs: jobs.data || [], ledger: ledger.data || [] };
}

export default function ContractorPay({ id }) {
  const [state, setState] = useState({ loading: true, error: "", partner: null, jobs: [], ledger: [] });
  const [open, setOpen] = useState("");

  const refresh = useCallback(
    () =>
      load(id).then(
        (data) => setState({ loading: false, error: "", ...data }),
        () => setState((s) => ({ ...s, loading: false, error: "We couldn't load this. Refresh the page to try again." }))
      ),
    [id]
  );
  useEffect(() => {
    refresh();
  }, [refresh]);

  const { loading, error, partner, jobs, ledger } = state;
  if (loading) return <p className="small">Loading…</p>;
  if (!partner) return <div className="warnbox">{error || "Partner not found."}</div>;

  const pct = Number(partner.loan_share_pct || 0);
  const loanName = partner.loan_name || "Loan";
  const loanLower = loanName.toLowerCase();
  const pay = contractorPay(jobs, ledger, pct);
  const noPrice = jobs.filter((j) => j.partner_pay == null && Number(j.actual_cost) > 0);
  const firstName = partner.name.match(/\(([^)]+)\)/)?.[1] || partner.name.split(" ")[0];
  const done = () => {
    setOpen("");
    refresh();
  };
  const toggle = (k) => setOpen(open === k ? "" : k);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href={`/admin/partners/${id}`}>
          ← {partner.name}
        </Link>
        <span className="eyebrow">Staff · Contractor pay</span>
        <h1 className="admin-title">{firstName}&apos;s Pay</h1>
        <p className="small">
          Work orders count at {firstName}&apos;s price before HST and are paid in full: owners are billed that plus HST, and IRep holds
          the HST back. Leasing fees owed to him are added here
          {pct > 0 ? `, and ${pct}% of each goes to the ${loanLower} until it's paid off` : ""}. Paid to him so far:{" "}
          {money(pay.totals.paid)}.
        </p>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      <div className="rent-stats">
        {[
          ["Work orders (before HST)", pay.totals.earned],
          ["Leasing fees", pay.totals.leasing],
          [pct > 0 ? `To ${loanLower}` : "Paid to him", pct > 0 ? pay.totals.toLoan : pay.totals.paid],
          ["Owing now", pay.owed],
        ].map(([label, value]) => (
          <div key={label} className="stat">
            <span className="stat-label">{label}</span>
            <span className={`stat-value num${label === "Owing now" && value > 0 ? " owing" : ""}`}>{money(value)}</span>
          </div>
        ))}
      </div>

      {pct > 0 ? (
        pay.loanSet ? (
          <p className="small">
            <b>
              {loanName} balance: {money(pay.loanBalance)}
            </b>{" "}
            ({money(pay.totals.loanAdded)} owed, {money(pay.totals.toLoan)} from his leasing fees
            {pay.totals.loanOther ? `, ${money(pay.totals.loanOther)} paid other ways` : ""}).
          </p>
        ) : (
          <div className="warnbox">
            Add the {loanLower} balance with &ldquo;Set {loanLower} balance&rdquo;. Until it&apos;s set, nothing is held back from his
            leasing fees for the loan.
          </div>
        )
      ) : null}

      {noPrice.length ? (
        <div className="warnbox">
          <p>
            <b>
              {noPrice.length} completed work order{noPrice.length === 1 ? " has" : "s have"} no price for {firstName} yet
            </b>
            , so {noPrice.length === 1 ? "it isn't" : "they aren't"} counted. Open each and fill in &ldquo;Partner&apos;s price (before
            HST)&rdquo;.
          </p>
          <ul className="plain-list">
            {noPrice.map((j) => (
              <li key={j.id}>
                <Link href={`/admin/maintenance/${j.id}`}>
                  {j.unit?.property?.address}: {j.title}
                </Link>{" "}
                <span className="small">· billed {money(j.actual_cost)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="req-actions">
        <button type="button" className="btn primary" onClick={() => toggle("payment")}>
          Record a payment to {firstName}
        </button>
        <button type="button" className="btn ghost" onClick={() => toggle("fee")}>
          Add a leasing fee
        </button>
        {pct > 0 ? (
          <button type="button" className="btn ghost" onClick={() => toggle("loan")}>
            {pay.loanSet ? `Update ${loanLower}` : `Set ${loanLower} balance`}
          </button>
        ) : null}
        <button type="button" className="btn ghost" onClick={() => toggle("adjustment")}>
          Adjustment
        </button>
        <button type="button" className="btn ghost" onClick={() => toggle("settings")}>
          Loan settings
        </button>
      </div>

      {open === "payment" ? (
        <EntryForm partnerId={id} kind="payment" suggested={pay.owed} onDone={done} />
      ) : open === "fee" ? (
        <LeasingFeeForm partnerId={id} ledger={ledger} pct={pct} loanName={loanName} onDone={done} />
      ) : open === "loan" ? (
        <LoanForm partnerId={id} loanName={loanName} onDone={done} />
      ) : open === "adjustment" ? (
        <EntryForm partnerId={id} kind="adjustment" onDone={done} />
      ) : open === "settings" ? (
        <LoanSettings partner={partner} onDone={done} />
      ) : null}

      <section className="stack" aria-labelledby="cp-months">
        <h2 id="cp-months" className="sec-title">
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
                    Paid
                  </th>
                  <th scope="col" className="num">
                    Owing at month end
                  </th>
                </tr>
              </thead>
              <tbody>
                {pay.months.map((m) => (
                  <MonthRows key={m.month} m={m} pct={pct} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small">Nothing recorded yet.</p>
        )}
      </section>

      <Ledger ledger={ledger} onChanged={refresh} />
    </div>
  );
}

function MonthRows({ m, pct }) {
  const [show, setShow] = useState(false);
  const hst = (j) => (j.charge_to === "irep" ? 0 : Math.max(cents(j.actual_cost) - cents(j.partner_pay), 0) / 100);
  const cols = pct > 0 ? 6 : 5;
  const count = m.jobs.length + m.fees.length;
  const day = (ts) => shortDate(new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }));
  return (
    <>
      <tr>
        <th scope="row">
          <button type="button" className="linkish" onClick={() => setShow(!show)} aria-expanded={show}>
            {monthLabel(m.month)} {count ? `· ${count} item${count === 1 ? "" : "s"}` : ""} {count ? (show ? "▾" : "▸") : ""}
          </button>
        </th>
        <td className="num">{m.earned ? money(m.earned) : "—"}</td>
        <td className="num">{m.leasing ? money(m.leasing) : "—"}</td>
        {pct > 0 ? <td className="num">{m.toLoan ? `−${money(m.toLoan)}` : "—"}</td> : null}
        <td className="num">{m.paid ? `−${money(m.paid)}` : "—"}</td>
        <td className="num">
          <b>{money(m.owedAtEnd)}</b>
        </td>
      </tr>
      {show
        ? [
            ...m.jobs.map((j) => (
              <tr key={j.id} className="muted-row">
                <td colSpan={cols}>
                  <span className="small">
                    {day(j.completed_at)} · Work order:{" "}
                    <Link href={`/admin/maintenance/${j.id}`}>
                      {j.unit?.property?.address}
                      {j.unit?.label && j.unit.label !== "Whole property" ? `, ${j.unit.label}` : ""}: {j.title}
                    </Link>{" "}
                    · {money(j.partner_pay)} to him
                    {hst(j) ? ` · ${money(hst(j))} HST held back` : ""} · charged to {CHARGE_LABEL[j.charge_to] || j.charge_to}
                  </span>
                </td>
              </tr>
            )),
            ...m.fees.map((f) => (
              <tr key={f.id} className="muted-row">
                <td colSpan={cols}>
                  <span className="small">
                    {shortDate(f.entry_date)} · Leasing fee: {f.notes || "—"} · {money(f.amount)}
                    {f.toLoan ? ` (${money(f.toLoan)} to loan, ${money(Number(f.amount) - f.toLoan)} to him)` : ""}
                  </span>
                </td>
              </tr>
            )),
          ]
        : null}
    </>
  );
}

function LeasingFeeForm({ partnerId, ledger, pct, loanName, onDone }) {
  const [items, setItems] = useState(null);
  const [pick, setPick] = useState("");
  const [form, setForm] = useState({ entry_date: today(), amount: "", notes: "", property_id: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const used = new Set(ledger.map((e) => e.statement_item_id).filter(Boolean));

  useEffect(() => {
    getBrowserClient()
      .from("statement_items")
      .select("id, period, description, amount, property_id, property:properties(address)")
      .eq("kind", "leasing_fee")
      .order("period", { ascending: false })
      .limit(60)
      .then(({ data }) => setItems(data || []));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const choose = (id) => {
    setPick(id);
    const it = (items || []).find((x) => x.id === id);
    if (!it) return setForm((f) => ({ ...f, property_id: null }));
    const beforeHst = Math.round((Math.abs(Number(it.amount)) / (1 + DEFAULT_HST_PERCENT / 100)) * 100) / 100;
    setForm({
      entry_date: it.period,
      amount: beforeHst.toFixed(2),
      notes: `${it.property?.address || ""}: ${feeLabel(it.description)}`,
      property_id: it.property_id,
    });
  };

  async function save(e) {
    e.preventDefault();
    const problem = checkAmount(form.amount);
    if (problem) return setErr(problem);
    if (!form.notes.trim()) return setErr("Say which lease this is for.");
    setBusy(true);
    const { error } = await getBrowserClient()
      .from("partner_ledger")
      .insert({
        partner_id: partnerId,
        kind: "leasing_fee",
        entry_date: form.entry_date,
        amount: cents(form.amount) / 100,
        notes: form.notes.trim(),
        property_id: form.property_id,
        statement_item_id: pick || null,
      });
    setBusy(false);
    if (error) return setErr("That didn't save. Try again.");
    onDone();
  }

  const choices = (items || []).filter((x) => !used.has(x.id));
  return (
    <form className="boxed stack" onSubmit={save} noValidate>
      <h2 className="sec-title">Leasing Fee Owed to Him</h2>
      <div className="field">
        <label htmlFor="lf-pick">From a landlord statement</label>
        <select id="lf-pick" value={pick} onChange={(e) => choose(e.target.value)} disabled={!items}>
          <option value="">{items ? "Not from a statement (type it in)" : "Loading…"}</option>
          {choices.map((x) => (
            <option key={x.id} value={x.id}>
              {x.period.slice(0, 7)} · {x.property?.address}: {feeLabel(x.description)}
            </option>
          ))}
        </select>
        <span className="small">Picking one fills in the fee before HST. Change the amount if he gets only part of it.</span>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="lf-d">Date</label>
          <input id="lf-d" type="date" value={form.entry_date} onChange={set("entry_date")} />
        </div>
        <div className="field">
          <label htmlFor="lf-a">Owed to him, before HST (CAD)</label>
          <input id="lf-a" inputMode="decimal" value={form.amount} onChange={set("amount")} />
          {pct > 0 && Number(form.amount) > 0 ? (
            <span className="small">
              {money(Math.round(Number(form.amount) * pct) / 100)} goes to the {loanName.toLowerCase()} while it has a balance.
            </span>
          ) : null}
        </div>
      </div>
      <div className="field">
        <label htmlFor="lf-n">Lease</label>
        <input id="lf-n" value={form.notes} onChange={set("notes")} placeholder="525 Randolph Ave: Joel, Lower Room 3" />
      </div>
      {err ? (
        <div className="warnbox" role="alert">
          {err}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function EntryForm({ partnerId, kind, suggested, onDone }) {
  const [form, setForm] = useState({
    entry_date: today(),
    amount: suggested > 0 ? suggested.toFixed(2) : "",
    method: "e-Transfer",
    notes: "",
    sign: "+",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const problem = checkAmount(form.amount);
    if (problem) return setErr(problem);
    if (kind === "adjustment" && !form.notes.trim()) return setErr("Add a note saying what the adjustment is for.");
    setBusy(true);
    const amount = cents(form.amount) / 100;
    const { error } = await getBrowserClient()
      .from("partner_ledger")
      .insert({
        partner_id: partnerId,
        kind,
        entry_date: form.entry_date,
        amount: kind === "adjustment" && form.sign === "-" ? -amount : amount,
        method: kind === "payment" ? form.method : null,
        notes: form.notes.trim() || null,
      });
    setBusy(false);
    if (error) return setErr("That didn't save. Try again.");
    onDone();
  }

  return (
    <form className="boxed stack" onSubmit={save} noValidate>
      <h2 className="sec-title">{kind === "payment" ? "Payment to Him" : "Adjustment"}</h2>
      {kind === "adjustment" ? (
        <p className="small">For something not on a work order or leasing fee, like a job paid in cash or a correction.</p>
      ) : null}
      <div className="row3">
        <div className="field">
          <label htmlFor={`le-d-${kind}`}>Date</label>
          <input id={`le-d-${kind}`} type="date" value={form.entry_date} onChange={set("entry_date")} />
        </div>
        {kind === "adjustment" ? (
          <div className="field">
            <label htmlFor="le-sign">Type</label>
            <select id="le-sign" value={form.sign} onChange={set("sign")}>
              <option value="+">We owe him more</option>
              <option value="-">We owe him less</option>
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor={`le-a-${kind}`}>Amount (CAD)</label>
          <input id={`le-a-${kind}`} inputMode="decimal" value={form.amount} onChange={set("amount")} />
        </div>
        {kind === "payment" ? (
          <div className="field">
            <label htmlFor="le-m">Method</label>
            <select id="le-m" value={form.method} onChange={set("method")}>
              {PAY_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor={`le-n-${kind}`}>Note {kind === "payment" ? "(optional)" : ""}</label>
        <input
          id={`le-n-${kind}`}
          value={form.notes}
          onChange={set("notes")}
          placeholder={kind === "payment" ? "e.g. October work orders" : ""}
        />
      </div>
      {err ? (
        <div className="warnbox" role="alert">
          {err}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function LoanForm({ partnerId, loanName, onDone }) {
  const [form, setForm] = useState({ kind: "loan_opening", entry_date: today(), amount: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const problem = checkAmount(form.amount);
    if (problem) return setErr(problem);
    setBusy(true);
    const { error } = await getBrowserClient()
      .from("partner_ledger")
      .insert({
        partner_id: partnerId,
        kind: form.kind,
        entry_date: form.entry_date,
        amount: cents(form.amount) / 100,
        notes: form.notes.trim() || null,
      });
    setBusy(false);
    if (error) return setErr("That didn't save. Try again.");
    onDone();
  }

  return (
    <form className="boxed stack" onSubmit={save} noValidate>
      <h2 className="sec-title">{loanName}</h2>
      <div className="row3">
        <div className="field">
          <label htmlFor="ln-k">What happened</label>
          <select id="ln-k" value={form.kind} onChange={set("kind")}>
            <option value="loan_opening">Balance he owes (starting balance, or more added)</option>
            <option value="loan_payment">He paid toward it another way</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ln-d">As of</label>
          <input id="ln-d" type="date" value={form.entry_date} onChange={set("entry_date")} />
        </div>
        <div className="field">
          <label htmlFor="ln-a">Amount (CAD)</label>
          <input id="ln-a" inputMode="decimal" value={form.amount} onChange={set("amount")} />
        </div>
      </div>
      <p className="small">
        For the starting balance, use the balance on the date shown. Leasing fees dated on or after it put the loan share toward it.
      </p>
      <div className="field">
        <label htmlFor="ln-n">Note (optional)</label>
        <input id="ln-n" value={form.notes} onChange={set("notes")} />
      </div>
      {err ? (
        <div className="warnbox" role="alert">
          {err}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function LoanSettings({ partner, onDone }) {
  const [pct, setPct] = useState(String(partner.loan_share_pct ?? 0));
  const [name, setName] = useState(partner.loan_name || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save(e) {
    e.preventDefault();
    const n = Number(pct);
    if (!Number.isFinite(n) || n < 0 || n > 100) return setErr("Enter a percentage from 0 to 100.");
    setBusy(true);
    const { error } = await getBrowserClient()
      .from("partners")
      .update({ loan_share_pct: n, loan_name: name.trim() || null })
      .eq("id", partner.id);
    setBusy(false);
    if (error) return setErr("That didn't save. Try again.");
    onDone();
  }

  return (
    <form className="boxed stack" onSubmit={save} noValidate>
      <h2 className="sec-title">Loan Settings</h2>
      <div className="row2">
        <div className="field">
          <label htmlFor="ls-n">Loan name</label>
          <input id="ls-n" value={name} onChange={(e) => setName(e.target.value)} placeholder="Truck loan" />
        </div>
        <div className="field">
          <label htmlFor="ls-p">Share of his leasing fees toward it (%)</label>
          <input id="ls-p" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        </div>
      </div>
      <p className="small">Set to 0 for no loan. Work-order pay is never put toward the loan.</p>
      {err ? (
        <div className="warnbox" role="alert">
          {err}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function Ledger({ ledger, onChanged }) {
  const [busyId, setBusyId] = useState("");
  const [confirmId, setConfirmId] = useState("");

  async function remove(id) {
    setBusyId(id);
    await getBrowserClient().from("partner_ledger").delete().eq("id", id);
    setBusyId("");
    setConfirmId("");
    onChanged();
  }

  return (
    <section className="stack" aria-labelledby="cp-ledger">
      <h2 id="cp-ledger" className="sec-title">
        Leasing Fees, Payments and Loan
      </h2>
      {ledger.length ? (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Entry</th>
                <th scope="col" className="num">
                  Amount
                </th>
                <th scope="col">Note</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((e) => (
                <tr key={e.id}>
                  <td>{shortDate(e.entry_date)}</td>
                  <td>
                    {LEDGER_KIND_LABEL[e.kind]}
                    {e.method ? ` · ${e.method}` : ""}
                  </td>
                  <td className="num">{money(e.amount)}</td>
                  <td>{e.notes || "—"}</td>
                  <td>
                    {confirmId === e.id ? (
                      <span className="req-actions">
                        <button type="button" className="btn primary sm" onClick={() => remove(e.id)} disabled={busyId === e.id}>
                          {busyId === e.id ? "Removing…" : "Remove"}
                        </button>
                        <button type="button" className="btn ghost sm" onClick={() => setConfirmId("")}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="btn ghost sm" onClick={() => setConfirmId(e.id)}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small">Nothing recorded yet.</p>
      )}
    </section>
  );
}
