"use client";

import { useEffect, useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { loadTenancyOptions, monthLabel, primaryTenant, shortDate, tenancyAddress, thisMonth, todayISO } from "@/lib/rent";
import RentNav, { RentHead } from "./RentNav";
import TenancyPicker from "./TenancyPicker";

const TENANT_REASONS = {
  overpaid: "Overpaid / credit on their account",
  rent: "Rent for a month (e.g. leaving early)",
  last_month_rent: "Last month's rent",
  other: "Other",
};
const LANDLORD_REASONS = {
  fee: "Fee charged in error",
  work_order: "Work order charged in error",
  other: "Other",
};
const REASON_LABEL = { ...TENANT_REASONS, overpaid: "Overpayment", rent: "Rent", ...LANDLORD_REASONS };
const METHODS = { etransfer: "e-Transfer", cheque: "Cheque", direct_deposit: "Direct deposit", other: "Other" };
const FUNDING_LABEL = {
  landlord: "Off the landlord's payout",
  irep: "IRep covered it",
  payout: "Added to their payout",
  separate: "Sent separately",
};

const blank = () => ({
  recipient: "tenant",
  tenancy_id: "",
  property_id: "",
  reason: "overpaid",
  rent_month: thisMonth(),
  amount: "",
  funding: "landlord",
  statement_month: thisMonth(),
  sent: false,
  sent_on: todayISO(),
  method: "etransfer",
  reference: "",
  note: "",
});

const REFUND_SELECT =
  "*, property:properties(address, owner:owners(name)), tenancy:tenancies(id, unit:units(label), tenancy_tenants(full_name, is_primary, created_at))";

export default function Refunds() {
  const id = useId();
  const [rows, setRows] = useState(null);
  const [tenancies, setTenancies] = useState([]);
  const [properties, setProperties] = useState([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [marking, setMarking] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState("");

  async function load() {
    const sb = getBrowserClient();
    const [r, t, p] = await Promise.all([
      sb.from("refunds").select(REFUND_SELECT).order("created_at", { ascending: false }).limit(200),
      loadTenancyOptions({ includePast: true }).catch(() => []),
      sb.from("properties").select("id, address, city, owner:owners(name)").eq("archived", false).order("address"),
    ]);
    setRows(r.data || []);
    setTenancies(t || []);
    setProperties(p.data || []);
    if (r.error) setMsg({ kind: "err", text: "We couldn't load refunds. Refresh the page to try again." });
  }
  useEffect(() => {
    load();
  }, []);

  const set = (k) => (e) => {
    const v = e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "recipient") {
        next.reason = v === "tenant" ? "overpaid" : "fee";
        next.funding = v === "tenant" ? "landlord" : "payout";
      }
      return next;
    });
    setMsg({ kind: "", text: "" });
  };

  const isTenant = form.recipient === "tenant";
  const needsRentMonth = isTenant && ["overpaid", "rent"].includes(form.reason);
  const onStatement = ["landlord", "payout"].includes(form.funding);

  async function save(e) {
    e.preventDefault();
    const amount = String(form.amount).trim();
    if (isTenant && !form.tenancy_id) return setMsg({ kind: "err", text: "Choose the tenant." });
    if (!isTenant && !form.property_id) return setMsg({ kind: "err", text: "Choose the property." });
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return setMsg({ kind: "err", text: "Enter the amount in dollars, like 450 or 89.99." });
    if (!form.note.trim()) return setMsg({ kind: "err", text: "Add a short note on why, for the records." });
    setBusy(true);
    const { error } = await getBrowserClient()
      .from("refunds")
      .insert({
        recipient: form.recipient,
        tenancy_id: isTenant ? form.tenancy_id : null,
        // For a tenant refund the database fills in the property from the tenancy.
        property_id: isTenant ? tenancies.find((t) => t.id === form.tenancy_id)?.unit?.property?.id : form.property_id,
        reason: form.reason,
        rent_period: needsRentMonth ? `${form.rent_month}-01` : null,
        amount: Number(amount),
        funding: form.funding,
        statement_period: onStatement ? `${form.statement_month}-01` : null,
        status: form.sent ? "sent" : "to_send",
        sent_on: form.sent ? form.sent_on : null,
        method: form.sent ? (form.funding === "payout" ? "payout" : form.method) : null,
        reference: form.sent ? form.reference.trim() || null : null,
        note: form.note.trim(),
      });
    setBusy(false);
    if (error) return setMsg({ kind: "err", text: `That didn't save: ${error.message}` });
    setForm(blank());
    setMsg({
      kind: "ok",
      text: onStatement
        ? `Refund recorded and added to the ${monthLabel(`${form.statement_month}-01`)} statement.`
        : "Refund recorded.",
    });
    load();
  }

  async function markSent(r) {
    const m = marking;
    const { error } = await getBrowserClient()
      .from("refunds")
      .update({ status: "sent", sent_on: m.sent_on, method: r.funding === "payout" ? "payout" : m.method, reference: m.reference.trim() || null })
      .eq("id", r.id);
    if (error) return setMsg({ kind: "err", text: "That didn't save. Try again." });
    setMarking(null);
    load();
  }

  async function remove(r) {
    const { error } = await getBrowserClient().from("refunds").delete().eq("id", r.id);
    setConfirmDelete("");
    if (error) return setMsg({ kind: "err", text: "That didn't delete. Try again." });
    setMsg({ kind: "ok", text: "Refund deleted, along with its statement line." });
    load();
  }

  const who = (r) => {
    if (r.recipient === "landlord") return r.property?.owner?.name || "Landlord";
    return r.tenancy ? primaryTenant(r.tenancy) : "Tenant";
  };
  const toSend = (rows || []).filter((r) => r.status === "to_send");
  const sent = (rows || []).filter((r) => r.status === "sent");

  const table = (list, open) => (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">To</th>
            <th scope="col">Property</th>
            <th scope="col">For</th>
            <th scope="col" className="r">Amount</th>
            <th scope="col">Paid from</th>
            <th scope="col">{open ? "Recorded" : "Sent"}</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td>
                <b>{who(r)}</b>
                <span className="small sub-line">{r.recipient === "tenant" ? "Tenant" : "Landlord"}</span>
              </td>
              <td>
                {r.property?.address}
                {r.tenancy?.unit?.label ? <span className="small">, {r.tenancy.unit.label}</span> : null}
              </td>
              <td>
                {REASON_LABEL[r.reason]}
                {r.rent_period ? ` · ${monthLabel(r.rent_period)}` : ""}
                <span className="small sub-line pre-line">{r.note}</span>
              </td>
              <td className="r num">{money(r.amount)}</td>
              <td className="small">
                {FUNDING_LABEL[r.funding]}
                {r.statement_period ? ` (${monthLabel(r.statement_period)} statement)` : ""}
              </td>
              <td className="small">
                {open
                  ? shortDate(String(r.created_at).slice(0, 10))
                  : [shortDate(r.sent_on), r.method === "payout" ? "with payout" : METHODS[r.method], r.reference].filter(Boolean).join(" · ")}
              </td>
              <td className="r">
                {confirmDelete === r.id ? (
                  <span className="req-actions" style={{ justifyContent: "flex-end" }}>
                    <span className="small">Delete{r.statement_item_id ? " it and its statement line" : ""}?</span>
                    <button type="button" className="btn primary sm" onClick={() => remove(r)}>
                      Yes, delete
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => setConfirmDelete("")}>
                      Keep
                    </button>
                  </span>
                ) : marking?.id === r.id ? null : (
                  <span className="req-actions" style={{ justifyContent: "flex-end" }}>
                    {open ? (
                      <button
                        type="button"
                        className="btn primary sm"
                        onClick={() => setMarking({ id: r.id, sent_on: todayISO(), method: "etransfer", reference: "" })}
                      >
                        Mark sent
                      </button>
                    ) : null}
                    <button type="button" className="link-btn small" onClick={() => setConfirmDelete(r.id)}>
                      Delete
                    </button>
                  </span>
                )}
                {marking?.id === r.id ? (
                  <span className="stack" style={{ gap: 6, textAlign: "left", minWidth: 220 }}>
                    <label className="small" htmlFor={`${id}-ms-d`}>
                      Sent on
                    </label>
                    <input id={`${id}-ms-d`} type="date" value={marking.sent_on} onChange={(e) => setMarking((m) => ({ ...m, sent_on: e.target.value }))} />
                    {r.funding !== "payout" ? (
                      <>
                        <label className="small" htmlFor={`${id}-ms-m`}>
                          How
                        </label>
                        <select id={`${id}-ms-m`} value={marking.method} onChange={(e) => setMarking((m) => ({ ...m, method: e.target.value }))}>
                          {Object.entries(METHODS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <label className="small" htmlFor={`${id}-ms-r`}>
                          Reference (optional)
                        </label>
                        <input id={`${id}-ms-r`} value={marking.reference} onChange={(e) => setMarking((m) => ({ ...m, reference: e.target.value }))} />
                      </>
                    ) : null}
                    <span className="req-actions">
                      <button type="button" className="btn primary sm" onClick={() => markSent(r)}>
                        Save
                      </button>
                      <button type="button" className="btn ghost sm" onClick={() => setMarking(null)}>
                        Cancel
                      </button>
                    </span>
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 24 }}>
      <RentHead
        title="Refunds"
        intro="Money IRep gives back to a tenant or a landlord. Each refund updates the tenant's rent balance and the landlord's statement for you."
      />
      <RentNav current="/admin/rent/refunds" />

      {msg.text ? (
        <div className={msg.kind === "err" ? "warnbox" : "okbox"} role={msg.kind === "err" ? "alert" : "status"}>
          {msg.text}
        </div>
      ) : null}

      <form className="boxed stack" onSubmit={save} noValidate aria-labelledby={`${id}-h`}>
        <h2 id={`${id}-h`} className="sec-title">
          Record a Refund
        </h2>
        <div className="seg" role="group" aria-label="Refund to">
          {[
            ["tenant", "To a tenant"],
            ["landlord", "To a landlord"],
          ].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={form.recipient === k} onClick={() => set("recipient")(k)}>
              {l}
            </button>
          ))}
        </div>

        {isTenant ? (
          <TenancyPicker id={`${id}-t`} label="Tenant" tenancies={tenancies} value={form.tenancy_id} onChange={set("tenancy_id")} />
        ) : (
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
        )}

        <div className="row3">
          <div className="field">
            <label htmlFor={`${id}-r`}>What it&apos;s for</label>
            <select id={`${id}-r`} value={form.reason} onChange={set("reason")}>
              {Object.entries(isTenant ? TENANT_REASONS : LANDLORD_REASONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {needsRentMonth ? (
            <div className="field">
              <label htmlFor={`${id}-rm`}>{form.reason === "rent" ? "Rent month refunded" : "Month the overpayment was for"}</label>
              <input id={`${id}-rm`} type="month" value={form.rent_month} onChange={set("rent_month")} />
            </div>
          ) : null}
          <div className="field">
            <label htmlFor={`${id}-a`}>Amount</label>
            <input id={`${id}-a`} inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="1100" />
          </div>
        </div>
        {isTenant ? (
          <p className="small" style={{ margin: 0 }}>
            {form.reason === "overpaid"
              ? "Uses up the tenant's credit, so their balance goes back toward zero."
              : form.reason === "rent"
                ? "That month counts as not charged and not paid, so the tenant's balance doesn't change and the month no longer shows as owing."
                : "Doesn't change the tenant's rent balance."}
          </p>
        ) : null}

        <div className="row2">
          <div className="field">
            <label htmlFor={`${id}-f`}>{isTenant ? "Who covers it" : "How it's paid"}</label>
            <select id={`${id}-f`} value={form.funding} onChange={set("funding")}>
              {(isTenant
                ? [
                    ["landlord", "The landlord: take it off their payout"],
                    ["irep", "IRep covers it (doesn't touch the landlord)"],
                  ]
                : [
                    ["payout", "Add it to their payout"],
                    ["separate", "Sent separately"],
                  ]
              ).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {onStatement ? (
            <div className="field">
              <label htmlFor={`${id}-sm`}>On the statement for</label>
              <input id={`${id}-sm`} type="month" value={form.statement_month} onChange={set("statement_month")} />
            </div>
          ) : null}
        </div>
        {onStatement ? (
          <p className="small" style={{ margin: 0 }}>
            {form.funding === "landlord"
              ? "Shows on the landlord's statement as “Refund to tenant … ” and comes off what they're paid that month."
              : "Shows on the landlord's statement as “Refund from IRep …” and is added to what they're paid that month."}
          </p>
        ) : null}

        <div className="field">
          <label htmlFor={`${id}-n`}>Note (staff only)</label>
          <textarea id={`${id}-n`} rows={2} value={form.note} onChange={set("note")} placeholder="Paid November twice; landlord agreed to refund" />
        </div>

        {form.funding !== "payout" ? (
          <label className="check-line">
            <input type="checkbox" checked={form.sent} onChange={set("sent")} />
            Already sent
          </label>
        ) : null}
        {form.sent && form.funding !== "payout" ? (
          <div className="row3">
            <div className="field">
              <label htmlFor={`${id}-sd`}>Sent on</label>
              <input id={`${id}-sd`} type="date" value={form.sent_on} onChange={set("sent_on")} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-sh`}>How</label>
              <select id={`${id}-sh`} value={form.method} onChange={set("method")}>
                {Object.entries(METHODS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-sr`}>Reference (optional)</label>
              <input id={`${id}-sr`} value={form.reference} onChange={set("reference")} />
            </div>
          </div>
        ) : null}

        <div className="req-actions">
          <button type="submit" className="btn primary sm" disabled={busy}>
            {busy ? "Saving…" : "Record refund"}
          </button>
        </div>
      </form>

      <section className="boxed stack" aria-labelledby={`${id}-open`}>
        <h2 id={`${id}-open`} className="sec-title">
          To Send ({toSend.length})
        </h2>
        {rows === null ? <p className="small">Loading…</p> : toSend.length ? table(toSend, true) : <p className="small">Nothing waiting to go out.</p>}
      </section>

      <section className="boxed stack" aria-labelledby={`${id}-sent`}>
        <h2 id={`${id}-sent`} className="sec-title">
          Sent
        </h2>
        {rows === null ? <p className="small">Loading…</p> : sent.length ? table(sent, false) : <p className="small">No refunds sent yet.</p>}
      </section>
    </div>
  );
}
