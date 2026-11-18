"use client";

import { useEffect, useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { monthLabel, shortDate, thisMonth, todayISO } from "@/lib/rent";
import { EXPENSE_BUCKET, EXPENSE_FILE_TYPES, openExpenseInvoice, uploadExpenseInvoice } from "@/lib/expense-files";

const METHODS = { etransfer: "e-Transfer", online_banking: "Online bill payment", cheque: "Cheque", card: "Card", other: "Other" };

const nextMonth = () => {
  const [y, m] = thisMonth().split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const blank = () => ({
  property_id: "",
  payee: "",
  description: "",
  invoice_ref: "",
  bill_date: "",
  amount: "",
  statement_month: nextMonth(),
  paid: false,
  paid_on: todayISO(),
  method: "online_banking",
  reference: "",
  note: "",
});

// Staff: bills IRep pays for a landlord at their request (pest control, a utility bill...).
// Each one is deducted on the landlord's statement for the month chosen.
export default function LandlordExpenses() {
  const id = useId();
  const [rows, setRows] = useState(null);
  const [properties, setProperties] = useState([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [marking, setMarking] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [uploading, setUploading] = useState("");
  const [monthly, setMonthly] = useState([]);

  async function load() {
    const sb = getBrowserClient();
    const [r, p, m] = await Promise.all([
      sb
        .from("landlord_expenses")
        .select("*, property:properties(address, owner:owners(name))")
        .order("created_at", { ascending: false })
        .limit(300),
      sb.from("properties").select("id, address, owner:owners(name)").eq("archived", false).order("address"),
      sb
        .from("recurring_expenses")
        .select("*, property:properties(address, owner:owners(name))")
        .order("created_at", { ascending: false }),
    ]);
    setMonthly(m.data || []);
    setRows(r.data || []);
    setProperties(p.data || []);
    if (r.error) setMsg({ kind: "err", text: "We couldn't load the expenses. Refresh the page to try again." });
  }
  useEffect(() => {
    load();
  }, []);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setMsg({ kind: "", text: "" });
  };

  async function save(e) {
    e.preventDefault();
    const amount = String(form.amount).trim();
    if (!form.property_id) return setMsg({ kind: "err", text: "Choose the property." });
    if (!form.payee.trim()) return setMsg({ kind: "err", text: "Who is the bill from?" });
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return setMsg({ kind: "err", text: "Enter the amount in dollars, like 113 or 89.99." });
    if (!/^\d{4}-\d{2}$/.test(form.statement_month)) return setMsg({ kind: "err", text: "Choose the statement month." });
    setBusy(true);
    const { data: saved, error } = await getBrowserClient()
      .from("landlord_expenses")
      .insert({
        property_id: form.property_id,
        payee: form.payee.trim(),
        description: form.description.trim() || null,
        invoice_ref: form.invoice_ref.trim() || null,
        bill_date: form.bill_date || null,
        amount: Number(amount),
        statement_period: `${form.statement_month}-01`,
        status: form.paid ? "paid" : "to_pay",
        paid_on: form.paid ? form.paid_on : null,
        method: form.paid ? form.method : null,
        reference: form.paid ? form.reference.trim() || null : null,
        note: form.note.trim() || null,
      })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      return setMsg({ kind: "err", text: `That didn't save: ${error.message}` });
    }
    const fileProblem = file ? await uploadExpenseInvoice(saved, file) : null;
    setBusy(false);
    const month = monthLabel(`${form.statement_month}-01`);
    setForm(blank());
    setFile(null);
    setFileKey((k) => k + 1);
    setMsg(
      fileProblem
        ? { kind: "err", text: `Saved and deducted on the ${month} statement, but ${fileProblem} Add the bill from the list below.` }
        : { kind: "ok", text: `Saved and deducted on the ${month} statement.` }
    );
    load();
  }

  async function markPaid(r) {
    const m = marking;
    const { error } = await getBrowserClient()
      .from("landlord_expenses")
      .update({ status: "paid", paid_on: m.paid_on, method: m.method, reference: m.reference.trim() || null })
      .eq("id", r.id);
    if (error) return setMsg({ kind: "err", text: `That didn't save: ${error.message}` });
    setMarking(null);
    load();
  }

  async function remove(r) {
    const sb = getBrowserClient();
    const { error } = await sb.from("landlord_expenses").delete().eq("id", r.id);
    setConfirmDelete("");
    if (error) return setMsg({ kind: "err", text: `That didn't delete: ${error.message}` });
    if (r.invoice_path) await sb.storage.from(EXPENSE_BUCKET).remove([r.invoice_path]);
    load();
  }

  async function attach(r, f) {
    if (!f) return;
    setUploading(r.id);
    const problem = await uploadExpenseInvoice(r, f);
    setUploading("");
    if (problem) return setMsg({ kind: "err", text: problem });
    setMsg({ kind: "ok", text: `Bill saved for ${r.payee}.` });
    load();
  }

  async function view(r) {
    const problem = await openExpenseInvoice(r.id);
    if (problem) setMsg({ kind: "err", text: problem });
  }

  const toPay = (rows || []).filter((r) => r.status === "to_pay");
  const paid = (rows || []).filter((r) => r.status === "paid");

  function table(list, open) {
    return (
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Property</th>
              <th scope="col">Bill</th>
              <th scope="col" className="r">
                Amount
              </th>
              <th scope="col">On statement</th>
              <th scope="col">{open ? "Recorded" : "Paid"}</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td className="addr">
                  {r.property?.address}
                  <span className="sub-line small">{r.property?.owner?.name}</span>
                </td>
                <td>
                  {r.payee}
                  {r.recurring_id ? <span className="small"> · Monthly</span> : null}
                  <span className="sub-line small">
                    {[r.description, r.invoice_ref ? `Invoice ${r.invoice_ref}` : "", r.bill_date ? `Dated ${shortDate(r.bill_date)}` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {r.note ? <span className="sub-line small">{r.note}</span> : null}
                  <span className="sub-line small req-actions" style={{ gap: 10 }}>
                    {r.invoice_path ? (
                      <button type="button" className="link-btn small" onClick={() => view(r)}>
                        View Bill
                      </button>
                    ) : (
                      <span>No bill attached</span>
                    )}
                    <label className="link-btn small" style={{ cursor: "pointer" }}>
                      {uploading === r.id ? "Uploading…" : r.invoice_path ? "Replace" : "Attach Bill"}
                      <input
                        type="file"
                        accept={EXPENSE_FILE_TYPES}
                        className="visually-hidden"
                        disabled={uploading === r.id}
                        onChange={(e) => {
                          attach(r, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </span>
                </td>
                <td className="r num">{money(r.amount)}</td>
                <td>{monthLabel(r.statement_period)}</td>
                <td>
                  {open
                    ? shortDate(String(r.created_at).slice(0, 10))
                    : [shortDate(r.paid_on), METHODS[r.method], r.reference].filter(Boolean).join(" · ")}
                </td>
                <td className="r">
                  {confirmDelete === r.id ? (
                    <span className="req-actions" style={{ justifyContent: "flex-end" }}>
                      <span className="small">Delete it and its statement line?</span>
                      <button type="button" className="btn primary sm" onClick={() => remove(r)}>
                        Yes, Delete
                      </button>
                      <button type="button" className="btn ghost sm" onClick={() => setConfirmDelete("")}>
                        Keep
                      </button>
                    </span>
                  ) : marking?.id === r.id ? (
                    <span className="stack" style={{ gap: 6, textAlign: "left", minWidth: 220 }}>
                      <label className="small" htmlFor={`${id}-mp-d`}>
                        Paid on
                      </label>
                      <input id={`${id}-mp-d`} type="date" value={marking.paid_on} onChange={(e) => setMarking((m) => ({ ...m, paid_on: e.target.value }))} />
                      <label className="small" htmlFor={`${id}-mp-m`}>
                        How
                      </label>
                      <select id={`${id}-mp-m`} value={marking.method} onChange={(e) => setMarking((m) => ({ ...m, method: e.target.value }))}>
                        {Object.entries(METHODS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <label className="small" htmlFor={`${id}-mp-r`}>
                        Reference (optional)
                      </label>
                      <input id={`${id}-mp-r`} value={marking.reference} onChange={(e) => setMarking((m) => ({ ...m, reference: e.target.value }))} />
                      <span className="req-actions">
                        <button type="button" className="btn primary sm" onClick={() => markPaid(r)}>
                          Save
                        </button>
                        <button type="button" className="btn ghost sm" onClick={() => setMarking(null)}>
                          Cancel
                        </button>
                      </span>
                    </span>
                  ) : (
                    <span className="req-actions" style={{ justifyContent: "flex-end" }}>
                      {open ? (
                        <button
                          type="button"
                          className="btn primary sm"
                          onClick={() => setMarking({ id: r.id, paid_on: todayISO(), method: "online_banking", reference: "" })}
                        >
                          Mark Paid
                        </button>
                      ) : null}
                      <button type="button" className="link-btn small" onClick={() => setConfirmDelete(r.id)}>
                        Delete
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Landlords</span>
        <h1 className="admin-title">Additional Expenses</h1>
        <p className="small">
          Bills a landlord asks IRep to pay for them, like pest control. Each one is deducted on their statement for the month you choose and
          shows there as “Paid on your behalf”. The landlord sees them, and can open the bill, in their owner portal. In Reconciliation, mark the bank withdrawal as “Contractor or repair”.
        </p>
      </div>

      <form className="boxed stack" onSubmit={save} noValidate>
        <h2 className="sub-title">Add an Expense</h2>
        <div className="row2">
          <div className="field">
            <label htmlFor={`${id}-p`}>Property</label>
            <select id={`${id}-p`} value={form.property_id} onChange={set("property_id")}>
              <option value="">Choose…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                  {p.owner?.name ? ` (${p.owner.name})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-payee`}>Paid to</label>
            <input id={`${id}-payee`} value={form.payee} onChange={set("payee")} placeholder="Abell Pest Control" />
          </div>
        </div>
        <div className="row3">
          <div className="field">
            <label htmlFor={`${id}-desc`}>What for (optional)</label>
            <input id={`${id}-desc`} value={form.description} onChange={set("description")} placeholder="Pest control treatment" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-inv`}>Invoice number (optional)</label>
            <input id={`${id}-inv`} value={form.invoice_ref} onChange={set("invoice_ref")} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-bd`}>Bill date (optional)</label>
            <input id={`${id}-bd`} type="date" value={form.bill_date} onChange={set("bill_date")} />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor={`${id}-amt`}>Amount ($)</label>
            <input id={`${id}-amt`} inputMode="decimal" value={form.amount} onChange={set("amount")} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-sm`}>Deduct on the statement for</label>
            <input id={`${id}-sm`} type="month" value={form.statement_month} onChange={set("statement_month")} />
            <span className="small">Taken off the landlord&apos;s payout for this month&apos;s rent.</span>
          </div>
        </div>
        <label className="check-line">
          <input type="checkbox" checked={form.paid} onChange={set("paid")} />
          IRep has already paid this bill
        </label>
        {form.paid ? (
          <div className="row3">
            <div className="field">
              <label htmlFor={`${id}-pd`}>Paid on</label>
              <input id={`${id}-pd`} type="date" value={form.paid_on} onChange={set("paid_on")} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-pm`}>How</label>
              <select id={`${id}-pm`} value={form.method} onChange={set("method")}>
                {Object.entries(METHODS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-pr`}>Reference (optional)</label>
              <input id={`${id}-pr`} value={form.reference} onChange={set("reference")} />
            </div>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor={`${id}-file`}>Bill (PDF or photo, optional)</label>
          <input key={fileKey} id={`${id}-file`} type="file" accept={EXPENSE_FILE_TYPES} onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <span className="small">The landlord can open it from their owner portal.</span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-note`}>Note for the records (staff only, optional)</label>
          <input id={`${id}-note`} value={form.note} onChange={set("note")} placeholder="Landlord asked us to pay it by email, Nov 17" />
        </div>
        {msg.text ? (
          <div className={msg.kind === "err" ? "warnbox" : "okbox"} role={msg.kind === "err" ? "alert" : "status"}>
            {msg.text}
          </div>
        ) : null}
        <div className="req-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save Expense"}
          </button>
        </div>
      </form>

      <MonthlyExpenses rows={monthly} properties={properties} onChanged={load} />

      <section className="stack">
        <h2 className="sec-title">To Pay ({toPay.length})</h2>
        {rows === null ? <p className="small">Loading…</p> : toPay.length ? table(toPay, true) : <p className="small">Nothing waiting to be paid.</p>}
      </section>
      <section className="stack">
        <h2 className="sec-title">Paid</h2>
        {rows === null ? null : paid.length ? table(paid, false) : <p className="small">None yet.</p>}
      </section>
    </div>
  );
}

const blankMonthly = () => ({ property_id: "", payee: "", description: "", amount: "", first_month: nextMonth(), last_month: "" });

// Bills that repeat every month (internet, say). The daily job adds each month's expense on the 1st.
function MonthlyExpenses({ rows, properties, onChanged }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blankMonthly);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [confirmStop, setConfirmStop] = useState("");
  const now = thisMonth();
  const set = (k) => (e) => {
    setF((s) => ({ ...s, [k]: e.target.value }));
    setMsg({ kind: "", text: "" });
  };
  const running = (r) => !r.last_month || r.last_month.slice(0, 7) >= now;

  async function save(e) {
    e.preventDefault();
    const amount = String(f.amount).trim();
    if (!f.property_id) return setMsg({ kind: "err", text: "Choose the property." });
    if (!f.payee.trim()) return setMsg({ kind: "err", text: "Who is the bill from?" });
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return setMsg({ kind: "err", text: "Enter the monthly amount, like 75." });
    if (!/^\d{4}-\d{2}$/.test(f.first_month)) return setMsg({ kind: "err", text: "Choose the first month." });
    if (f.last_month && f.last_month < f.first_month) return setMsg({ kind: "err", text: "The last month is before the first month." });
    setBusy(true);
    const sb = getBrowserClient();
    const { error } = await sb.from("recurring_expenses").insert({
      property_id: f.property_id,
      payee: f.payee.trim(),
      description: f.description.trim() || null,
      amount: Number(amount),
      first_month: `${f.first_month}-01`,
      last_month: f.last_month ? `${f.last_month}-01` : null,
    });
    if (!error) await sb.rpc("ensure_recurring_expenses", { p_month: `${now}-01` });
    setBusy(false);
    if (error) return setMsg({ kind: "err", text: `That didn't save: ${error.message}` });
    setF(blankMonthly());
    setOpen(false);
    setMsg({ kind: "ok", text: `Saved. It's added to the statement every month from ${monthLabel(`${f.first_month}-01`)}.` });
    onChanged();
  }

  async function stop(r) {
    setConfirmStop("");
    const sb = getBrowserClient();
    // Not started yet: remove it. Otherwise this month's is the last one.
    const { error } =
      r.first_month.slice(0, 7) > now
        ? await sb.from("recurring_expenses").delete().eq("id", r.id)
        : await sb.from("recurring_expenses").update({ last_month: `${now}-01` }).eq("id", r.id);
    if (error) return setMsg({ kind: "err", text: `That didn't save: ${error.message}` });
    onChanged();
  }

  return (
    <section className="boxed stack">
      <h2 className="sub-title">Monthly Expenses</h2>
      <p className="small" style={{ margin: 0 }}>
        Bills that repeat every month at the same amount. On the 1st of each month the expense is added to the list below and deducted on
        that month&apos;s statement. Mark it paid and attach the bill as usual.
      </p>
      {rows.length ? (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Property</th>
                <th scope="col">Bill</th>
                <th scope="col" className="r">
                  Each month
                </th>
                <th scope="col">Months</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="addr">
                    {r.property?.address}
                    <span className="sub-line small">{r.property?.owner?.name}</span>
                  </td>
                  <td>
                    {r.payee}
                    {r.description ? <span className="sub-line small">{r.description}</span> : null}
                  </td>
                  <td className="r num">{money(r.amount)}</td>
                  <td>
                    {monthLabel(r.first_month)} to {r.last_month ? monthLabel(r.last_month) : "ongoing"}
                  </td>
                  <td className="r">
                    {!running(r) ? (
                      <span className="small">Ended</span>
                    ) : confirmStop === r.id ? (
                      <span className="req-actions" style={{ justifyContent: "flex-end" }}>
                        <span className="small">
                          {r.first_month.slice(0, 7) > now ? "Remove it?" : `Stop after ${monthLabel(`${now}-01`)}?`}
                        </span>
                        <button type="button" className="btn primary sm" onClick={() => stop(r)}>
                          Yes, Stop
                        </button>
                        <button type="button" className="btn ghost sm" onClick={() => setConfirmStop("")}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="link-btn small" onClick={() => setConfirmStop(r.id)}>
                        Stop
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {msg.text ? (
        <div className={msg.kind === "err" ? "warnbox" : "okbox"} role={msg.kind === "err" ? "alert" : "status"}>
          {msg.text}
        </div>
      ) : null}
      {!open ? (
        <div>
          <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>
            Add Monthly Expense
          </button>
        </div>
      ) : (
        <form className="stack" onSubmit={save} noValidate>
          <div className="row2">
            <div className="field">
              <label htmlFor={`${id}-mp`}>Property</label>
              <select id={`${id}-mp`} value={f.property_id} onChange={set("property_id")}>
                <option value="">Choose…</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address}
                    {p.owner?.name ? ` (${p.owner.name})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-mpay`}>Paid to</label>
              <input id={`${id}-mpay`} value={f.payee} onChange={set("payee")} placeholder="Oxio" />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor={`${id}-md`}>What for (optional)</label>
              <input id={`${id}-md`} value={f.description} onChange={set("description")} placeholder="Internet" />
            </div>
            <div className="field">
              <label htmlFor={`${id}-ma`}>Amount each month ($)</label>
              <input id={`${id}-ma`} inputMode="decimal" value={f.amount} onChange={set("amount")} />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor={`${id}-mf`}>First statement month</label>
              <input id={`${id}-mf`} type="month" value={f.first_month} onChange={set("first_month")} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-ml`}>Last month (optional)</label>
              <input id={`${id}-ml`} type="month" value={f.last_month} onChange={set("last_month")} />
              <span className="small">Leave blank to keep going until you stop it.</span>
            </div>
          </div>
          <div className="req-actions">
            <button type="submit" className="btn primary sm" disabled={busy}>
              {busy ? "Saving…" : "Save Monthly Expense"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
