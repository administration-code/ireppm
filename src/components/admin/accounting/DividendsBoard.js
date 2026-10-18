"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { dollars, downloadCsv, staffMessage } from "@/lib/accounting";
import { todayISO } from "@/lib/rent";
import AccountingTabs from "./AccountingTabs";

const money = (n) => Number(n || 0).toFixed(2);
const EMPTY = { paid_on: "", recipient: "", recipient_type: "individual", share_class: "", amount: "", eligible: false, declared_on: "", note: "", bank_transaction_id: null };

async function load(year) {
  const sb = getBrowserClient();
  const [divs, t5, lines] = await Promise.all([
    sb.from("dividends").select("*").gte("paid_on", `${year}-01-01`).lte("paid_on", `${year}-12-31`).order("paid_on"),
    sb.rpc("t5_summary", { p_year: year }),
    sb
      .from("bank_transactions")
      .select("id, posted_on, description, amount, note")
      .eq("category", "shareholder")
      .gte("posted_on", `${year}-01-01`)
      .lte("posted_on", `${year}-12-31`)
      .order("posted_on"),
  ]);
  if (divs.error) throw new Error(staffMessage(divs.error, "We couldn't load the dividends."));
  const linked = new Set((divs.data || []).map((d) => d.bank_transaction_id).filter(Boolean));
  return { dividends: divs.data || [], t5: t5.data || [], lines: (lines.data || []).filter((l) => !linked.has(l.id) && l.amount < 0) };
}

const guessName = (l) => (/rishi/i.test(`${l.description} ${l.note}`) ? "Rishi Bakshi" : /zan|chuck/i.test(`${l.description} ${l.note}`) ? "Zan (Chuck) Greksa" : "");

export default function DividendsBoard({ year: initialYear }) {
  const id = useId();
  const thisYear = Number(todayISO().slice(0, 4));
  const [year, setYear] = useState(initialYear || thisYear);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      setData(await load(year));
    } catch (err) {
      setError(err.message);
    }
  }, [year]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    setMsg("");
    if (!form.paid_on || !form.recipient.trim() || !(Number(form.amount) > 0)) return setMsg("Add the date paid, who received it and the amount.");
    setBusy(true);
    const { error: err } = await getBrowserClient()
      .from("dividends")
      .insert({
        paid_on: form.paid_on,
        recipient: form.recipient.trim(),
        recipient_type: form.recipient_type,
        share_class: form.share_class.trim() || null,
        amount: Number(form.amount),
        eligible: form.eligible,
        declared_on: form.declared_on || null,
        note: form.note.trim() || null,
        bank_transaction_id: form.bank_transaction_id,
      });
    setBusy(false);
    if (err) return setMsg(staffMessage(err, "That didn't save. Try again."));
    setForm(EMPTY);
    setMsg("Dividend recorded.");
    refresh();
  }

  async function remove(d) {
    if (!window.confirm(`Delete the ${dollars(d.amount)} dividend to ${d.recipient} on ${d.paid_on}?`)) return;
    await getBrowserClient().from("dividends").delete().eq("id", d.id);
    refresh();
  }

  function exportT5() {
    downloadCsv(
      `irep-${year}-t5-summary.csv`,
      ["recipient", "type", "box10_actual_noneligible", "box11_taxable_noneligible", "box12_credit_noneligible", "box24_actual_eligible", "box25_taxable_eligible", "box26_credit_eligible", "slip_needed"],
      (data?.t5 || []).map((r) => [r.recipient, r.recipient_type, money(r.box10), money(r.box11), money(r.box12), money(r.box24), money(r.box25), money(r.box26), r.slip_needed ? "yes" : "no"])
    );
  }

  const years = [];
  for (let y = thisYear; y >= thisYear - 5; y--) years.push(y);
  const recipients = [...new Set((data?.dividends || []).map((d) => d.recipient))];

  return (
    <div className="stack">
      <AccountingTabs title="Dividends & T5" subtitle="Dividends IRep pays its shareholders, and the totals for their T5 slips (due by the end of February).">
        <div className="field acct-picker">
          <label htmlFor={`${id}-year`}>Year</label>
          <select id={`${id}-year`} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </AccountingTabs>
      {error ? <div className="warnbox">{error}</div> : null}
      {!data ? <p className="small">Loading…</p> : null}

      {data ? (
        <>
          <section className="boxed stack">
            <div className="admin-head">
              <h2 className="sec-title">T5 totals for {year}</h2>
              <button type="button" className="btn ghost sm" onClick={exportT5} disabled={!data.t5.length}>
                Download for the Accountant
              </button>
            </div>
            {data.t5.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Recipient</th>
                      <th scope="col" className="num">Box 10: actual (non-eligible)</th>
                      <th scope="col" className="num">Box 11: taxable</th>
                      <th scope="col" className="num">Box 12: tax credit</th>
                      <th scope="col" className="num">Box 24: actual (eligible)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.t5.map((r) => (
                      <tr key={r.recipient}>
                        <th scope="row">
                          {r.recipient}
                          {r.recipient_type === "corporation" ? <span className="small"> (company)</span> : null}
                        </th>
                        <td className="num">{dollars(r.box10)}</td>
                        <td className="num">{dollars(r.box11)}</td>
                        <td className="num">{dollars(r.box12)}</td>
                        <td className="num">{dollars(r.box24)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="small">No dividends recorded for {year} yet.</p>
            )}
            <p className="small">
              IRep&apos;s dividends are normally non-eligible (paid from income taxed at the small business rate). Each slip also needs the
              recipient&apos;s SIN or business number: your accountant adds those; they&apos;re never stored here. Employees (salary) get a T4
              through payroll instead.
            </p>
          </section>

          <section className="boxed stack">
            <h2 className="sec-title">Record a Dividend</h2>
            <form className="stack" onSubmit={save} noValidate>
              <div className="row3">
                <div className="field">
                  <label htmlFor={`${id}-paid`}>Date paid</label>
                  <input id={`${id}-paid`} type="date" value={form.paid_on} onChange={set("paid_on")} />
                </div>
                <div className="field">
                  <label htmlFor={`${id}-who`}>Paid to</label>
                  <input id={`${id}-who`} list={`${id}-names`} value={form.recipient} onChange={set("recipient")} placeholder="Rishi Bakshi" />
                  <datalist id={`${id}-names`}>
                    {[...new Set([...recipients, "Rishi Bakshi", "Zan (Chuck) Greksa"])].map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
                <div className="field">
                  <label htmlFor={`${id}-amt`}>Amount ($)</label>
                  <input id={`${id}-amt`} inputMode="decimal" value={form.amount} onChange={set("amount")} />
                </div>
              </div>
              <div className="row3">
                <div className="field">
                  <label htmlFor={`${id}-type`}>Recipient is</label>
                  <select id={`${id}-type`} value={form.recipient_type} onChange={set("recipient_type")}>
                    <option value="individual">A person</option>
                    <option value="corporation">A holding company</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${id}-class`}>Share class (optional)</label>
                  <input id={`${id}-class`} value={form.share_class} onChange={set("share_class")} placeholder="Class A" />
                </div>
                <div className="field">
                  <label htmlFor={`${id}-decl`}>Declared on (resolution date)</label>
                  <input id={`${id}-decl`} type="date" value={form.declared_on} onChange={set("declared_on")} />
                </div>
              </div>
              <label className="check">
                <input type="checkbox" checked={form.eligible} onChange={set("eligible")} />
                Eligible dividend (rare for IRep: only from income taxed at the general rate)
              </label>
              <div className="field">
                <label htmlFor={`${id}-note`}>Note (optional)</label>
                <input id={`${id}-note`} value={form.note} onChange={set("note")} />
              </div>
              {form.bank_transaction_id ? <p className="small">Linked to a bank line.</p> : null}
              <div className="row">
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Record dividend"}
                </button>
                {msg ? <span className="small">{msg}</span> : null}
              </div>
            </form>
          </section>

          {data.lines.length ? (
            <section className="boxed stack">
              <h2 className="sec-title">Bank payments to Rishi or Chuck not recorded yet ({data.lines.length})</h2>
              <p className="small">
                These were marked &quot;Paid to or from Rishi or Chuck&quot;. Record the ones that were dividends; commissions and loan repayments
                belong on Commissions &amp; loans.
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <tbody>
                    {data.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.posted_on}</td>
                        <td>
                          {l.description}
                          {l.note ? <span className="sub-line small">{l.note}</span> : null}
                        </td>
                        <td className="num">{dollars(-l.amount)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() =>
                              setForm({ ...EMPTY, paid_on: l.posted_on, amount: String(-l.amount), recipient: guessName(l), bank_transaction_id: l.id, note: l.description })
                            }
                          >
                            Record as dividend
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="boxed stack">
            <h2 className="sec-title">Dividends paid in {year}</h2>
            {data.dividends.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <tbody>
                    {data.dividends.map((d) => (
                      <tr key={d.id}>
                        <td>{d.paid_on}</td>
                        <td>
                          {d.recipient}
                          {d.share_class ? <span className="small"> · {d.share_class}</span> : null}
                          {d.note ? <span className="sub-line small">{d.note}</span> : null}
                        </td>
                        <td className="num">{dollars(d.amount)}</td>
                        <td className="small">{d.declared_on ? `Declared ${d.declared_on}` : "No resolution date"}</td>
                        <td>
                          <button type="button" className="btn ghost sm" onClick={() => remove(d)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="small">None yet.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
