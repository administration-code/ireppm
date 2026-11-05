"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { shortDate } from "@/lib/rent";
import { DECISION, REPORT_STATUS, loadReport } from "@/lib/inspection-reports";
import { ensureSpecialUnit } from "@/lib/maintenance-units";
import InspectionChecks from "@/components/InspectionChecks";

async function bearer() {
  const { data } = await getBrowserClient().auth.getSession();
  return data?.session?.access_token || "";
}

const pillFor = (d) => (d === "approved" ? "rs-confirmed" : d === "declined" ? "ns-void" : "rs-requested");

// Staff: one inspection report. Edit the improvements, send them to the landlord, price the
// approved ones and turn them into work orders.
export default function InspectionReportDetail({ id }) {
  const [r, setR] = useState(undefined);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const [cc, setCc] = useState(true);
  const [newItem, setNewItem] = useState({ description: "", details: "", unit_id: "" });
  const [prices, setPrices] = useState({});

  const reload = useCallback(() => loadReport(getBrowserClient(), id).then((data) => setR(data)), [id]);
  useEffect(() => {
    reload();
  }, [reload]);

  if (r === undefined) return <p className="small">Loading…</p>;
  if (!r) return <div className="warnbox">Report not found.</div>;

  const sb = getBrowserClient();
  const owner = r.property?.owner;
  const unitOptions = r.units.map((u) => ({ id: u.unit_id, label: u.unit?.label }));
  const flash = (kind, text) => setMsg({ kind, text });

  async function addItem(e) {
    e.preventDefault();
    if (!newItem.description.trim()) return flash("err", "Give the improvement a short name.");
    const { error } = await sb.from("improvement_items").insert({
      report_id: r.id,
      property_id: r.property_id,
      unit_id: newItem.unit_id || null,
      sort: r.items.length,
      description: newItem.description.trim(),
      details: newItem.details.trim() || null,
      added_by: "IRep staff",
    });
    if (error) return flash("err", "That didn't save. Try again.");
    setNewItem({ description: "", details: "", unit_id: "" });
    flash("", "");
    reload();
  }

  async function removeItem(item) {
    const { error } = await sb.from("improvement_items").delete().eq("id", item.id);
    if (error) return flash("err", "That didn't delete. Try again.");
    reload();
  }

  async function savePrice(item) {
    const v = String(prices[item.id] ?? "").trim();
    if (v && !/^\d+(\.\d{1,2})?$/.test(v)) return flash("err", "Enter the price in dollars, like 450 or 89.99.");
    const { error } = await sb.from("improvement_items").update({ price: v ? Number(v) : null }).eq("id", item.id);
    if (error) return flash("err", "That didn't save. Try again.");
    flash("ok", `Price saved for “${item.description}”.`);
    reload();
  }

  async function makeWorkOrder(item) {
    try {
      const unitId = item.unit_id || (await ensureSpecialUnit(sb, r.property_id, "whole"));
      const { data, error } = await sb
        .from("maintenance_requests")
        .insert({
          unit_id: unitId,
          source: "inspection",
          category: "other",
          title: item.description,
          description: [item.details, `From the inspection on ${r.inspected_on}. Landlord approved ${shortDate(String(item.decided_at || "").slice(0, 10))}.`]
            .filter(Boolean)
            .join("\n\n"),
          urgency: "routine",
          status: "triaged",
          estimated_cost: item.price,
          estimate_plus_hst: item.price != null,
          owner_approval: "approved",
          charge_to: "owner",
        })
        .select("id")
        .single();
      if (error) throw error;
      await sb.from("improvement_items").update({ maintenance_request_id: data.id }).eq("id", item.id);
      flash("ok", `Work order created for “${item.description}”.`);
      reload();
    } catch {
      flash("err", "We couldn't create the work order. Try again.");
    }
  }

  async function send() {
    setSending(true);
    flash("", "");
    const res = await fetch(`/api/inspection-reports/${r.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await bearer()}` },
      body: JSON.stringify({ message: note, cc_office: cc }),
    });
    const json = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) return flash("err", json.error || "The email didn't send. Try again.");
    flash("ok", `Sent to ${json.to}. They can approve or decline each item in their landlord portal.`);
    reload();
  }

  async function setStatus(status) {
    await sb.from("inspection_reports").update({ status }).eq("id", r.id);
    reload();
  }

  async function removeReport() {
    if (!window.confirm("Delete this inspection report and its improvements? This can't be undone.")) return;
    const { error } = await sb.from("inspection_reports").delete().eq("id", r.id);
    if (error) return flash("err", "That didn't delete. Try again.");
    window.location.href = "/admin/inspection-reports";
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <Link className="back" href="/admin/inspection-reports">
          ← All inspection reports
        </Link>
        <span className="eyebrow">Staff · Inspection report</span>
        <h1 className="admin-title">{r.property?.address}</h1>
        <p className="small" style={{ margin: 0 }}>
          {shortDate(r.inspected_on)} · by {r.inspected_by || "IRep staff"} · <span className="pill">{REPORT_STATUS[r.status]}</span> ·{" "}
          <Link href={`/admin/inspection-reports/${r.id}/print`}>PDF</Link>
          {r.sent_at ? ` · sent to ${r.sent_to} on ${shortDate(String(r.sent_at).slice(0, 10))}` : ""}
        </p>
      </div>

      {msg.text ? (
        <div className={msg.kind === "err" ? "warnbox" : "okbox"} role={msg.kind === "err" ? "alert" : "status"}>
          {msg.text}
        </div>
      ) : null}

      <section className="boxed stack" aria-labelledby="ir-checks">
        <h2 id="ir-checks" className="sec-title">
          Checks
        </h2>
        <InspectionChecks
          checks={r}
          units={r.units.map((u) => ({ label: u.unit?.label, stove: u.stove, fridge: u.fridge, washer: u.washer, dryer: u.dryer, notes: u.notes }))}
        />
        {r.notes ? <p className="req-note pre-line">{r.notes}</p> : null}
      </section>

      <section className="boxed stack" aria-labelledby="ir-items">
        <h2 id="ir-items" className="sec-title">
          Recommended Improvements
        </h2>
        {r.items.length ? (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Improvement</th>
                  <th scope="col">Landlord</th>
                  <th scope="col">Price (before HST)</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <b>{i.description}</b>
                      {i.unit?.label && i.unit.label !== "Whole property" ? <span className="small"> · {i.unit.label}</span> : null}
                      {i.details ? <span className="small sub-line">{i.details}</span> : null}
                      {i.added_by ? <span className="small sub-line">Added by {i.added_by}</span> : null}
                    </td>
                    <td>
                      <span className={`pill ${pillFor(i.decision)}`}>{DECISION[i.decision]}</span>
                      {i.owner_note ? <span className="small sub-line">“{i.owner_note}”</span> : null}
                    </td>
                    <td style={{ minWidth: 170 }}>
                      {i.decision === "declined" ? (
                        "—"
                      ) : (
                        <span className="req-actions" style={{ flexWrap: "nowrap" }}>
                          <input
                            className="cell-input"
                            inputMode="decimal"
                            style={{ width: 90 }}
                            value={prices[i.id] ?? (i.price != null ? String(Number(i.price)) : "")}
                            onChange={(e) => setPrices((p) => ({ ...p, [i.id]: e.target.value }))}
                            aria-label={`Price for ${i.description}`}
                          />
                          <button type="button" className="btn ghost sm" onClick={() => savePrice(i)}>
                            Save
                          </button>
                        </span>
                      )}
                      {i.price != null && i.decision !== "declined" ? (
                        <span className="small sub-line">{money(Math.round(Number(i.price) * 113) / 100)} with HST</span>
                      ) : null}
                    </td>
                    <td className="r">
                      {i.maintenance_request_id ? (
                        <Link className="btn ghost sm" href={`/admin/maintenance/${i.maintenance_request_id}`}>
                          Work order
                        </Link>
                      ) : i.decision === "approved" ? (
                        <button type="button" className="btn primary sm" onClick={() => makeWorkOrder(i)} disabled={i.price == null}>
                          Create work order
                        </button>
                      ) : null}
                      {i.decision === "pending" ? (
                        <button type="button" className="btn ghost sm" onClick={() => removeItem(i)}>
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small">No improvements yet. Add one below.</p>
        )}
        <form className="stack" style={{ gap: 8 }} onSubmit={addItem} noValidate>
          <div className="row3">
            <div className="field">
              <label htmlFor="ir-new">Add an improvement</label>
              <input id="ir-new" value={newItem.description} onChange={(e) => setNewItem((n) => ({ ...n, description: e.target.value }))} placeholder="Light fixture replacement" />
            </div>
            <div className="field">
              <label htmlFor="ir-new-u">Where</label>
              <select id="ir-new-u" value={newItem.unit_id} onChange={(e) => setNewItem((n) => ({ ...n, unit_id: e.target.value }))}>
                <option value="">Whole property</option>
                {unitOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ir-new-d">Details (optional)</label>
              <input id="ir-new-d" value={newItem.details} onChange={(e) => setNewItem((n) => ({ ...n, details: e.target.value }))} />
            </div>
          </div>
          <div>
            <button type="submit" className="btn ghost sm">
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="boxed stack" aria-labelledby="ir-send">
        <h2 id="ir-send" className="sec-title">
          Send to the Landlord
        </h2>
        {owner?.email ? (
          <>
            <p className="small" style={{ margin: 0 }}>
              Emails {owner.name || "the landlord"} ({owner.email}) the checks and the list of improvements, with a link to approve or decline each
              one in their portal. They don&apos;t see prices or who inspected.
              {r.sent_at ? " You can send it again after adding items." : ""}
            </p>
            <div className="field">
              <label htmlFor="ir-msg">Message (optional)</label>
              <textarea id="ir-msg" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="We inspected the property on…" />
            </div>
            <label className="check-line">
              <input type="checkbox" checked={cc} onChange={(e) => setCc(e.target.checked)} />
              Send a copy to administration@ireppm.ca
            </label>
            <div className="req-actions">
              <button type="button" className="btn primary sm" onClick={send} disabled={sending || !r.items.length}>
                {sending ? "Sending…" : r.sent_at ? "Send again" : `Send to ${owner.email}`}
              </button>
            </div>
          </>
        ) : (
          <p className="small">This landlord has no email on file. Add one on the owner&apos;s page first.</p>
        )}
      </section>

      <div className="req-actions">
        <Link className="btn primary sm" href={`/admin/inspection-reports/${r.id}/print`}>
          PDF for the landlord
        </Link>
        {r.status !== "closed" ? (
          <button type="button" className="btn ghost sm" onClick={() => setStatus("closed")}>
            Mark report closed
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={() => setStatus(r.sent_at ? "sent" : "submitted")}>
            Reopen
          </button>
        )}
        <button type="button" className="btn ghost sm danger" onClick={removeReport}>
          Delete report
        </button>
      </div>
    </div>
  );
}
