"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate, todayISO } from "@/lib/rent";
import { SITE } from "@/lib/site";
import {
  INVOICE_STATUS,
  LINE_CATEGORIES,
  PAID_METHODS,
  amount,
  defaultPaymentNote,
  invoiceNumber,
  invoiceTotals,
  lineAmount,
} from "@/lib/invoices";
import { authToken, openInvoicePdf } from "@/lib/invoice-client";

const plusDays = (iso, days) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const longDay = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "");
const blankLine = (over = {}) => ({ key: Math.random().toString(36).slice(2), category: "service", description: "", quantity: "1", unit_price: "", taxable: true, ...over });

function emptyInvoice() {
  const today = todayISO();
  return {
    owner_id: "",
    property_id: "",
    bill_to_name: "",
    bill_to_email: "",
    bill_to_address: "",
    title: "Leasing Fee",
    description: "",
    issue_date: today,
    due_date: plusDays(today, 14),
    hst_percent: "13",
    notes: defaultPaymentNote(),
    staff_note: "",
  };
}

// Staff: create or edit an invoice (drafts), then send, mark paid or void it.
export default function InvoiceEditor({ id }) {
  const router = useRouter();
  const uid = useId();
  const isNew = !id || id === "new";
  const [inv, setInv] = useState(null);
  const [f, setF] = useState(emptyInvoice);
  const [lines, setLines] = useState([blankLine()]);
  const [owners, setOwners] = useState([]);
  const [rates, setRates] = useState({ leasing_standard: 0.5, leasing_mls: 1 });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [panel, setPanel] = useState("");
  const [send, setSend] = useState({ message: "", cc: true });
  const [pay, setPay] = useState({ paid_on: todayISO(), paid_method: "etransfer", paid_reference: "" });
  const [voidReason, setVoidReason] = useState("");

  async function load() {
    const sb = getBrowserClient();
    const [o, r, doc] = await Promise.all([
      sb.from("owners").select("id, name, email, mailing_address, properties(id, address, city, archived)").order("name"),
      sb.from("service_rates").select("key, amount").in("key", ["leasing_standard", "leasing_mls", "hst"]),
      isNew ? Promise.resolve({ data: null }) : sb.rpc("invoice_doc", { p_id: id }),
    ]);
    setOwners(o.data || []);
    const rr = Object.fromEntries((r.data || []).map((x) => [x.key, Number(x.amount)]));
    setRates((s) => ({ ...s, ...rr }));
    if (isNew) {
      if (rr.hst >= 0) setF((s) => ({ ...s, hst_percent: String(rr.hst) }));
      return;
    }
    if (!doc.data) return setInv(false);
    const d = doc.data;
    setInv(d);
    setF({
      owner_id: d.owner_id || "",
      property_id: d.property_id || "",
      bill_to_name: d.bill_to_name || "",
      bill_to_email: d.bill_to_email || "",
      bill_to_address: d.bill_to_address || "",
      title: d.title || "",
      description: d.description || "",
      issue_date: d.issue_date,
      due_date: d.due_date || "",
      hst_percent: String(d.hst_percent),
      notes: d.notes || "",
      staff_note: d.staff_note || "",
    });
    setLines(
      (d.lines || []).map((l) => blankLine({ category: l.category, description: l.description, quantity: String(l.quantity), unit_price: String(l.unit_price), taxable: l.taxable }))
    );
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const editable = isNew || inv?.status === "draft";
  const owner = owners.find((o) => o.id === f.owner_id);
  const properties = useMemo(() => {
    const all = owner ? owner.properties || [] : owners.flatMap((o) => (o.properties || []).map((p) => ({ ...p, ownerName: o.name })));
    return all.filter((p) => !p.archived || p.id === f.property_id).sort((a, b) => a.address.localeCompare(b.address));
  }, [owners, owner, f.property_id]);
  const totals = invoiceTotals(lines.filter((l) => l.description.trim() || Number(l.unit_price)), f.hst_percent);

  const set = (k) => (e) => {
    const v = e.target.value;
    setMsg({ kind: "", text: "" });
    setF((s) => {
      const next = { ...s, [k]: v };
      if (k === "owner_id") {
        const o = owners.find((x) => x.id === v);
        next.bill_to_name = o?.name || "";
        next.bill_to_email = o?.email || "";
        next.bill_to_address = o?.mailing_address || "";
        const props = (o?.properties || []).filter((p) => !p.archived);
        next.property_id = props.length === 1 ? props[0].id : "";
      }
      if (k === "issue_date" && s.due_date && v && s.due_date < v) next.due_date = plusDays(v, 14);
      return next;
    });
  };
  const setLine = (key, k, v) => {
    setMsg({ kind: "", text: "" });
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)));
  };

  // Adds a leasing fee line from the property's newest tenancy: a share of one month's rent.
  async function addLeasingFee(months) {
    if (!f.property_id) return setMsg({ kind: "err", text: "Choose the property first." });
    setBusy("fee");
    const { data } = await getBrowserClient()
      .from("tenancies")
      .select("rent, start_date, status, tenancy_tenants(full_name, is_primary), unit:units!inner(label, property_id, property:properties(address))")
      .eq("unit.property_id", f.property_id)
      .in("status", ["upcoming", "active", "notice"])
      .order("start_date", { ascending: false })
      .limit(1);
    setBusy("");
    const t = data?.[0];
    if (!t?.rent) return setMsg({ kind: "err", text: "No current or upcoming tenancy with a rent at this property. Add the line by hand." });
    const fee = Math.round(Number(t.rent) * months * 100) / 100;
    const names = (t.tenancy_tenants || [])
      .slice()
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((x) => x.full_name)
      .join(" and ");
    const share = months === 1 ? "one month's rent" : months === 0.5 ? "half of one month's rent" : `${months} × one month's rent`;
    const unit = t.unit?.label && t.unit.label !== "Whole Home" && t.unit.label !== "Whole property" ? `, ${t.unit.label}` : "";
    const line = blankLine({
      category: "leasing_fee",
      description: `Leasing fee: ${share} (${amount(t.rent)}/month), ${t.unit?.property?.address || ""}${unit}`,
      unit_price: fee.toFixed(2),
    });
    setLines((ls) => [...ls.filter((l) => l.description.trim() || Number(l.unit_price)), line]);
    // Leasing fees are due within one week of the move-in date.
    const due = t.start_date ? plusDays(t.start_date, 7) : "";
    setF((s) => ({
      ...s,
      description: s.description.trim() ? s.description : `Tenant placement for the tenancy starting ${longDay(t.start_date)}${names ? ` (${names})` : ""}.`,
      due_date: due && due >= s.issue_date ? due : s.due_date,
    }));
    if (due) setMsg({ kind: "ok", text: `Due date set to ${longDay(due < f.issue_date ? f.issue_date : due)}, one week after the ${longDay(t.start_date)} move-in.` });
  }

  function check() {
    if (!f.bill_to_name.trim()) return "Add who the invoice is for.";
    if (!f.issue_date) return "Add the invoice date.";
    if (f.due_date && f.due_date < f.issue_date) return "The due date is before the invoice date.";
    if (!/^\d+(\.\d+)?$/.test(String(f.hst_percent))) return "Enter the HST rate, like 13.";
    const used = lines.filter((l) => l.description.trim() || String(l.unit_price).trim());
    if (!used.length) return "Add at least one line.";
    for (const l of used) {
      if (!l.description.trim()) return "Each line needs a description.";
      if (!/^\d+(\.\d{1,2})?$/.test(String(l.unit_price).trim())) return `Enter the price for “${l.description}” in dollars, like 625.`;
      if (!(Number(l.quantity) > 0)) return `Enter the quantity for “${l.description}”.`;
    }
    return "";
  }

  async function save() {
    const problem = check();
    if (problem) return setMsg({ kind: "err", text: problem }), null;
    setBusy("save");
    const sb = getBrowserClient();
    const row = {
      owner_id: f.owner_id || null,
      property_id: f.property_id || null,
      bill_to_name: f.bill_to_name.trim(),
      bill_to_email: f.bill_to_email.trim() || null,
      bill_to_address: f.bill_to_address.trim() || null,
      title: f.title.trim() || "Invoice",
      description: f.description.trim() || null,
      issue_date: f.issue_date,
      due_date: f.due_date || null,
      hst_percent: Number(f.hst_percent),
      notes: f.notes.trim() || null,
      staff_note: f.staff_note.trim() || null,
    };
    let invoiceId = isNew ? null : id;
    if (isNew) {
      const { data, error } = await sb.from("invoices").insert(row).select("id").single();
      if (error) {
        setBusy("");
        return setMsg({ kind: "err", text: `That didn't save: ${error.message}` }), null;
      }
      invoiceId = data.id;
    } else {
      const { error } = await sb.from("invoices").update(row).eq("id", id);
      if (error) {
        setBusy("");
        return setMsg({ kind: "err", text: `That didn't save: ${error.message}` }), null;
      }
      const { error: delErr } = await sb.from("invoice_lines").delete().eq("invoice_id", id);
      if (delErr) {
        setBusy("");
        return setMsg({ kind: "err", text: `The lines didn't save: ${delErr.message}` }), null;
      }
    }
    const used = lines.filter((l) => l.description.trim() || String(l.unit_price).trim());
    const { error: lineErr } = await sb.from("invoice_lines").insert(
      used.map((l, i) => ({
        invoice_id: invoiceId,
        sort: i,
        category: l.category,
        description: l.description.trim(),
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        taxable: l.taxable,
      }))
    );
    setBusy("");
    if (lineErr) return setMsg({ kind: "err", text: `The lines didn't save: ${lineErr.message}` }), null;
    if (isNew) {
      router.replace(`/admin/invoices/${invoiceId}`);
      return invoiceId;
    }
    setMsg({ kind: "ok", text: "Saved." });
    await load();
    return invoiceId;
  }

  async function pdf() {
    if (editable && !isNew) {
      const saved = await save();
      if (!saved) return;
    }
    const problem = await openInvoicePdf(id);
    if (problem) setMsg({ kind: "err", text: problem });
  }

  async function doSend() {
    if (editable) {
      const saved = await save();
      if (!saved) return;
    }
    if (!f.bill_to_email.trim()) return setMsg({ kind: "err", text: "Add the client's email under Bill To first." });
    setBusy("send");
    const res = await fetch(`/api/invoices/${id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await authToken()}` },
      body: JSON.stringify({ message: send.message, cc_office: send.cc }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy("");
    if (!res?.ok) return setMsg({ kind: "err", text: json.error || "The email didn't send. Try again." });
    setPanel("");
    setMsg({ kind: "ok", text: `Sent to ${json.to}.` });
    load();
  }

  async function update(changes, done) {
    setBusy("update");
    const { error } = await getBrowserClient().from("invoices").update(changes).eq("id", id);
    setBusy("");
    if (error) return setMsg({ kind: "err", text: `That didn't save: ${error.message}` });
    setPanel("");
    setMsg({ kind: "ok", text: done });
    load();
  }

  async function remove() {
    if (!window.confirm("Delete this draft? This can't be undone.")) return;
    const { error } = await getBrowserClient().from("invoices").delete().eq("id", id);
    if (error) return setMsg({ kind: "err", text: `That didn't delete: ${error.message}` });
    router.push("/admin/invoices");
  }

  async function duplicate() {
    setBusy("dup");
    const sb = getBrowserClient();
    const today = todayISO();
    const { data, error } = await sb
      .from("invoices")
      .insert({
        owner_id: inv.owner_id,
        property_id: inv.property_id,
        bill_to_name: inv.bill_to_name,
        bill_to_email: inv.bill_to_email,
        bill_to_address: inv.bill_to_address,
        title: inv.title,
        description: inv.description,
        issue_date: today,
        due_date: plusDays(today, 14),
        hst_percent: inv.hst_percent,
        notes: inv.notes,
        staff_note: `Copied from ${invoiceNumber(inv.invoice_no)}.`,
      })
      .select("id")
      .single();
    if (!error && inv.lines?.length) {
      await sb.from("invoice_lines").insert(
        inv.lines.map((l, i) => ({ invoice_id: data.id, sort: i, category: l.category, description: l.description, quantity: l.quantity, unit_price: l.unit_price, taxable: l.taxable }))
      );
    }
    setBusy("");
    if (error) return setMsg({ kind: "err", text: `That didn't copy: ${error.message}` });
    router.push(`/admin/invoices/${data.id}`);
  }

  if (inv === false) {
    return (
      <div className="stack">
        <div className="warnbox">This invoice wasn&apos;t found.</div>
        <Link href="/admin/invoices">Back to invoices</Link>
      </div>
    );
  }
  if (!isNew && !inv) return <p className="small">Loading…</p>;

  const label = isNew ? "New Invoice" : inv.status === "draft" ? `Draft Invoice` : invoiceNumber(inv.invoice_no);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <Link href="/admin/invoices" className="small">
          ← All invoices
        </Link>
        <div className="req-top">
          <h1 className="admin-title">{label}</h1>
          {!isNew ? <span className={`pill inv-${inv.status}`}>{INVOICE_STATUS[inv.status]}</span> : null}
        </div>
        {!isNew && inv.status !== "draft" ? (
          <p className="small">
            {inv.sent_to ? `Last emailed to ${inv.sent_to}${inv.sent_at ? ` on ${shortDate(String(inv.sent_at).slice(0, 10))}` : ""}. ` : ""}
            {inv.status === "paid" ? `Paid ${shortDate(inv.paid_on)}${inv.paid_method ? ` by ${PAID_METHODS[inv.paid_method]}` : ""}${inv.paid_reference ? ` (${inv.paid_reference})` : ""}.` : ""}
            {inv.status === "void" ? `Voided${inv.void_reason ? `: ${inv.void_reason}` : "."}` : ""}
            {inv.status === "sent" ? " Sent invoices can't be edited; void it and make a new one to change it." : ""}
          </p>
        ) : null}
      </div>

      <fieldset className="boxed stack" disabled={!editable || Boolean(busy)} style={{ border: 0 }}>
        <h2 className="sub-title">Bill To</h2>
        <div className="row2">
          <div className="field">
            <label htmlFor={`${uid}-o`}>Landlord</label>
            <select id={`${uid}-o`} value={f.owner_id} onChange={set("owner_id")}>
              <option value="">Someone else (type their details below)</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${uid}-p`}>Property (optional)</label>
            <select id={`${uid}-p`} value={f.property_id} onChange={set("property_id")}>
              <option value="">None</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                  {p.ownerName ? ` (${p.ownerName})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row3">
          <div className="field">
            <label htmlFor={`${uid}-n`}>Name on the invoice</label>
            <input id={`${uid}-n`} value={f.bill_to_name} onChange={set("bill_to_name")} />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-e`}>Email</label>
            <input id={`${uid}-e`} type="email" value={f.bill_to_email} onChange={set("bill_to_email")} />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-a`}>Mailing address (optional)</label>
            <input id={`${uid}-a`} value={f.bill_to_address} onChange={set("bill_to_address")} />
          </div>
        </div>
        {f.owner_id && owner && !owner.properties?.length ? <p className="small">This landlord has no properties on file.</p> : null}
      </fieldset>

      <fieldset className="boxed stack" disabled={!editable || Boolean(busy)} style={{ border: 0 }}>
        <h2 className="sub-title">Invoice</h2>
        <div className="row3">
          <div className="field">
            <label htmlFor={`${uid}-t`}>Title</label>
            <input id={`${uid}-t`} value={f.title} onChange={set("title")} placeholder="Leasing Fee" />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-d`}>Invoice date</label>
            <input id={`${uid}-d`} type="date" value={f.issue_date} onChange={set("issue_date")} />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-due`}>Due date (leasing fees: 1 week after move-in)</label>
            <input id={`${uid}-due`} type="date" value={f.due_date} onChange={set("due_date")} />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-desc`}>Description (optional, shown under the title)</label>
          <textarea id={`${uid}-desc`} rows={2} value={f.description} onChange={set("description")} />
        </div>

        <h3 className="sub-title" style={{ fontSize: "1.1rem" }}>
          Lines
        </h3>
        {editable ? (
          <div className="req-actions">
            <button type="button" className="btn ghost sm" onClick={() => addLeasingFee(rates.leasing_standard || 0.5)} disabled={busy === "fee"}>
              Add Leasing Fee (Half Month&apos;s Rent)
            </button>
            <button type="button" className="btn ghost sm" onClick={() => addLeasingFee(rates.leasing_mls || 1)} disabled={busy === "fee"}>
              Add MLS Leasing Fee (One Month&apos;s Rent)
            </button>
          </div>
        ) : null}
        <div className="table-scroll">
          <table className="admin-table invoice-edit">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Description</th>
                <th scope="col" className="r">
                  Qty
                </th>
                <th scope="col" className="r">
                  Unit price ($)
                </th>
                <th scope="col">HST</th>
                <th scope="col" className="r">
                  Amount
                </th>
                {editable ? (
                  <th scope="col">
                    <span className="visually-hidden">Remove</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.key}>
                  <td>
                    <select aria-label={`Line ${i + 1} type`} value={l.category} onChange={(e) => setLine(l.key, "category", e.target.value)}>
                      {Object.entries(LINE_CATEGORIES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ minWidth: 260 }}>
                    <input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => setLine(l.key, "description", e.target.value)} />
                  </td>
                  <td className="r" style={{ width: 70 }}>
                    <input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(l.key, "quantity", e.target.value)} />
                  </td>
                  <td className="r" style={{ width: 110 }}>
                    <input aria-label={`Line ${i + 1} unit price`} inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(l.key, "unit_price", e.target.value)} />
                  </td>
                  <td>
                    <input type="checkbox" aria-label={`Line ${i + 1} charges HST`} checked={l.taxable} onChange={(e) => setLine(l.key, "taxable", e.target.checked)} />
                  </td>
                  <td className="r num">{amount(lineAmount(l))}</td>
                  {editable ? (
                    <td>
                      <button
                        type="button"
                        className="link-btn small"
                        onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine()]))}
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable ? (
          <div>
            <button type="button" className="btn ghost sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
              Add Line
            </button>
          </div>
        ) : null}
        <dl className="letter-summary invoice-totals" style={{ maxWidth: 320, marginLeft: "auto" }}>
          <div>
            <dt>Subtotal</dt>
            <dd className="num">{amount(totals.subtotal)}</dd>
          </div>
          <div>
            <dt>
              HST (
              <input
                aria-label="HST rate"
                inputMode="decimal"
                value={f.hst_percent}
                onChange={set("hst_percent")}
                style={{ width: 48, display: "inline-block", padding: "2px 4px" }}
              />
              %)
            </dt>
            <dd className="num">{amount(totals.hst)}</dd>
          </div>
          <div className="letter-strong">
            <dt>Total</dt>
            <dd className="num">{amount(totals.total)}</dd>
          </div>
        </dl>

        <div className="field">
          <label htmlFor={`${uid}-notes`}>Payment instructions (printed on the invoice)</label>
          <textarea id={`${uid}-notes`} rows={2} value={f.notes} onChange={set("notes")} />
        </div>
        {!SITE.hstNumber ? (
          <p className="small">IRep&apos;s HST registration number isn&apos;t set up yet, so it won&apos;t print on the invoice.</p>
        ) : null}
      </fieldset>

      <div className="field boxed">
        <label htmlFor={`${uid}-sn`}>Staff note (never shown to the client)</label>
        <textarea
          id={`${uid}-sn`}
          rows={2}
          value={f.staff_note}
          onChange={set("staff_note")}
          onBlur={() => !editable && f.staff_note !== (inv?.staff_note || "") && update({ staff_note: f.staff_note.trim() || null }, "Note saved.")}
        />
      </div>

      {msg.text ? (
        <div className={msg.kind === "err" ? "warnbox" : "okbox"} role={msg.kind === "err" ? "alert" : "status"}>
          {msg.text}
        </div>
      ) : null}

      {panel === "send" ? (
        <section className="boxed stack">
          <h2 className="sub-title">Email the Invoice</h2>
          <p className="small" style={{ margin: 0 }}>
            To <b>{f.bill_to_email || "no email yet"}</b>, with the PDF attached.
            {editable ? " Once sent, it can't be edited." : ""}
          </p>
          <div className="field">
            <label htmlFor={`${uid}-msg`}>Message (optional)</label>
            <textarea
              id={`${uid}-msg`}
              rows={3}
              value={send.message}
              onChange={(e) => setSend((s) => ({ ...s, message: e.target.value }))}
              placeholder={`Hi ${f.bill_to_name.split(" ")[0] || ""}, thank you for choosing IRep. Please find our invoice attached…`}
            />
          </div>
          <label className="check-line">
            <input type="checkbox" checked={send.cc} onChange={(e) => setSend((s) => ({ ...s, cc: e.target.checked }))} />
            Send a copy to {SITE.email}
          </label>
          <div className="req-actions">
            <button type="button" className="btn primary sm" onClick={doSend} disabled={Boolean(busy) || !f.bill_to_email.trim()}>
              {busy === "send" ? "Sending…" : `Send to ${f.bill_to_email || "…"}`}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setPanel("")}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {panel === "paid" ? (
        <section className="boxed stack">
          <h2 className="sub-title">Mark Paid</h2>
          <div className="row3">
            <div className="field">
              <label htmlFor={`${uid}-pd`}>Paid on</label>
              <input id={`${uid}-pd`} type="date" value={pay.paid_on} onChange={(e) => setPay((s) => ({ ...s, paid_on: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor={`${uid}-pm`}>How</label>
              <select id={`${uid}-pm`} value={pay.paid_method} onChange={(e) => setPay((s) => ({ ...s, paid_method: e.target.value }))}>
                {Object.entries(PAID_METHODS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${uid}-pr`}>Reference (optional)</label>
              <input id={`${uid}-pr`} value={pay.paid_reference} onChange={(e) => setPay((s) => ({ ...s, paid_reference: e.target.value }))} />
            </div>
          </div>
          <div className="req-actions">
            <button
              type="button"
              className="btn primary sm"
              disabled={Boolean(busy) || !pay.paid_on}
              onClick={() => update({ status: "paid", paid_on: pay.paid_on, paid_method: pay.paid_method, paid_reference: pay.paid_reference.trim() || null }, "Marked paid.")}
            >
              Save Payment
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setPanel("")}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {panel === "void" ? (
        <section className="boxed stack">
          <h2 className="sub-title">Void Invoice</h2>
          <p className="small" style={{ margin: 0 }}>
            The number stays used and the invoice is kept, marked void. It no longer counts as income. This can&apos;t be undone.
          </p>
          <div className="field">
            <label htmlFor={`${uid}-vr`}>Reason</label>
            <input id={`${uid}-vr`} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Wrong amount; replaced by a new invoice" />
          </div>
          <div className="req-actions">
            <button
              type="button"
              className="btn primary sm"
              disabled={Boolean(busy) || !voidReason.trim()}
              onClick={() => update({ status: "void", void_reason: voidReason.trim() }, "Invoice voided.")}
            >
              Void Invoice
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setPanel("")}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <div className="req-actions">
        {editable ? (
          <button type="button" className="btn primary" onClick={save} disabled={Boolean(busy)}>
            {busy === "save" ? "Saving…" : isNew ? "Save Draft" : "Save Changes"}
          </button>
        ) : null}
        {!isNew ? (
          <button type="button" className="btn ghost" onClick={pdf} disabled={Boolean(busy)}>
            View PDF
          </button>
        ) : null}
        {!isNew && inv.status !== "void" ? (
          <button type="button" className={editable ? "btn ghost" : "btn primary"} onClick={() => setPanel("send")} disabled={Boolean(busy)}>
            {inv.status === "draft" ? "Send by Email" : "Email Again"}
          </button>
        ) : null}
        {!isNew && inv.status === "sent" ? (
          <button type="button" className="btn ghost" onClick={() => setPanel("paid")} disabled={Boolean(busy)}>
            Mark Paid
          </button>
        ) : null}
        {!isNew && inv.status === "paid" ? (
          <button type="button" className="btn ghost" onClick={() => update({ status: "sent" }, "Payment removed. It's unpaid again.")} disabled={Boolean(busy)}>
            Undo Payment
          </button>
        ) : null}
        {!isNew && inv.status === "draft" ? (
          <button type="button" className="link-btn small" onClick={remove} disabled={Boolean(busy)}>
            Delete Draft
          </button>
        ) : null}
        {!isNew && (inv.status === "sent" || inv.status === "paid") ? (
          <button type="button" className="link-btn small" onClick={() => setPanel("void")} disabled={Boolean(busy)}>
            Void
          </button>
        ) : null}
        {!isNew && inv.status !== "draft" ? (
          <button type="button" className="link-btn small" onClick={duplicate} disabled={Boolean(busy)}>
            Copy to New Draft
          </button>
        ) : null}
      </div>
      {isNew ? <p className="small">Save the draft to preview the PDF and send it.</p> : null}
    </div>
  );
}
