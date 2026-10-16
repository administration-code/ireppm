"use client";

import { useState } from "react";
import SendButtons from "@/components/admin/signatures/SendButtons";
import { IREP_SIGNER } from "@/lib/lease-defaults";
import { addDays, todayIso } from "@/lib/signatures";
import { baseFields, placeOf, tenantNamesOf } from "@/lib/signature-context";

const N5_REASONS = [
  { value: 1, label: "Interfered with reasonable enjoyment or another lawful right" },
  { value: 2, label: "Wilfully or negligently damaged the unit or complex" },
  { value: 3, label: "Too many people live in the unit" },
];

const emptyPeriod = () => ({ from: "", to: "", charged: "", paid: "", owing: "" });
const emptyEvent = () => ({ when: "", details: "" });

export default function NFormForm({ kind, ctx }) {
  const rent = ctx.tenancy?.rent ?? "";
  const [f, setF] = useState(() => ({
    ...baseFields(ctx),
    tenant_names: tenantNamesOf(ctx),
    unit_address: [placeOf(ctx), ctx.property?.city, ctx.property?.postal_code].filter(Boolean).join(", "),
    signing_as: "rep",
    signer: { name: "", email: "", phone: "" },
    current_rent: rent,
    new_rent: "",
    increase_date: kind === "N1" ? addDays(todayIso(), 91) : "",
    guideline: "at_or_below",
    termination_date: kind === "N4" ? addDays(todayIso(), 14) : kind === "N5" ? addDays(todayIso(), 20) : "",
    amount_owing: "",
    periods: [emptyPeriod()],
    notice_number: "first",
    reasons: [],
    events: [emptyEvent()],
    repair_cost: "",
    replace_cost: "",
    max_occupants: "",
  }));
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setSigner = (k) => (e) => setF((s) => ({ ...s, signer: { ...s.signer, [k]: e.target.value } }));
  const setRow = (list, i, k) => (e) =>
    setF((s) => {
      const rows = s[list].map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r));
      if (list === "periods" && (k === "charged" || k === "paid")) {
        const r = rows[i];
        rows[i] = { ...r, owing: r.charged === "" ? "" : String(Math.round(((Number(r.charged) || 0) - (Number(r.paid) || 0)) * 100) / 100) };
      }
      const next = { ...s, [list]: rows };
      if (list === "periods") {
        const total = rows.reduce((sum, r) => sum + (Number(r.owing) || 0), 0);
        if (total) next.amount_owing = String(Math.round(total * 100) / 100);
      }
      return next;
    });
  const toggleReason = (v) =>
    setF((s) => ({ ...s, reasons: s.reasons.includes(v) ? s.reasons.filter((r) => r !== v) : [...s.reasons, v].sort() }));

  const getForm = () => {
    if (!f.tenancy_id) throw new Error("Start this notice from a tenancy so it's linked correctly.");
    return f;
  };

  return (
    <form className="stack" style={{ gap: 20 }} onSubmit={(e) => e.preventDefault()}>
      <fieldset className="boxed stack">
        <legend className="sub-title">Parties</legend>
        <div className="row2">
          <div className="field">
            <label htmlFor="n-tenants">Tenant names</label>
            <input id="n-tenants" value={f.tenant_names} onChange={set("tenant_names")} />
          </div>
          <div className="field">
            <label htmlFor="n-landlord">Landlord name</label>
            <input id="n-landlord" value={f.landlord_name} onChange={set("landlord_name")} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="n-signing">Signed by</label>
          <select id="n-signing" value={f.signing_as} onChange={set("signing_as")}>
            <option value="rep">{IREP_SIGNER.name} as representative (IRep)</option>
            <option value="landlord">The landlord</option>
          </select>
        </div>
        {f.signing_as === "landlord" ? (
          <div className="row3">
            <div className="field">
              <label htmlFor="n-sname">Signer name</label>
              <input id="n-sname" value={f.signer.name} placeholder={ctx.owner?.name || ""} onChange={setSigner("name")} />
            </div>
            <div className="field">
              <label htmlFor="n-semail">Signer email</label>
              <input id="n-semail" type="email" value={f.signer.email} placeholder={ctx.owner?.email || ""} onChange={setSigner("email")} />
            </div>
            <div className="field">
              <label htmlFor="n-sphone">Signer phone</label>
              <input id="n-sphone" type="tel" value={f.signer.phone} onChange={setSigner("phone")} />
            </div>
          </div>
        ) : null}
      </fieldset>

      {kind === "N1" ? (
        <fieldset className="boxed stack">
          <legend className="sub-title">Rent increase</legend>
          <div className="row3">
            <div className="field">
              <label htmlFor="n1-current">Current rent ($/month)</label>
              <input id="n1-current" type="number" min="0" step="0.01" value={f.current_rent} onChange={set("current_rent")} />
            </div>
            <div className="field">
              <label htmlFor="n1-new">New rent ($/month)</label>
              <input id="n1-new" type="number" min="0" step="0.01" value={f.new_rent} onChange={set("new_rent")} />
            </div>
            <div className="field">
              <label htmlFor="n1-date">Increase takes effect</label>
              <input id="n1-date" type="date" value={f.increase_date} onChange={set("increase_date")} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="n1-guide">Guideline</label>
            <select id="n1-guide" value={f.guideline} onChange={set("guideline")}>
              <option value="at_or_below">At or below the guideline</option>
              <option value="above_approved">Above guideline, approved by the LTB</option>
              <option value="above_applied">Above guideline, applied for</option>
            </select>
          </div>
          <p className="small">The tenant must get at least 90 days&apos; written notice, and rent can increase once every 12 months.</p>
        </fieldset>
      ) : null}

      {kind === "N4" ? (
        <fieldset className="boxed stack">
          <legend className="sub-title">Rent owing</legend>
          {f.periods.map((p, i) => (
            <div className="sig-period" key={i}>
              <div className="field">
                <label htmlFor={`p-from-${i}`}>From</label>
                <input id={`p-from-${i}`} type="date" value={p.from} onChange={setRow("periods", i, "from")} />
              </div>
              <div className="field">
                <label htmlFor={`p-to-${i}`}>To</label>
                <input id={`p-to-${i}`} type="date" value={p.to} onChange={setRow("periods", i, "to")} />
              </div>
              <div className="field">
                <label htmlFor={`p-ch-${i}`}>Charged</label>
                <input id={`p-ch-${i}`} type="number" step="0.01" value={p.charged} onChange={setRow("periods", i, "charged")} />
              </div>
              <div className="field">
                <label htmlFor={`p-pd-${i}`}>Paid</label>
                <input id={`p-pd-${i}`} type="number" step="0.01" value={p.paid} onChange={setRow("periods", i, "paid")} />
              </div>
              <div className="field">
                <label htmlFor={`p-ow-${i}`}>Owing</label>
                <input id={`p-ow-${i}`} type="number" step="0.01" value={p.owing} onChange={setRow("periods", i, "owing")} />
              </div>
            </div>
          ))}
          {f.periods.length < 3 ? (
            <button type="button" className="link-btn small" style={{ justifySelf: "start" }} onClick={() => setF((s) => ({ ...s, periods: [...s.periods, emptyPeriod()] }))}>
              Add a rental period
            </button>
          ) : null}
          <div className="row2">
            <div className="field">
              <label htmlFor="n4-amount">Total amount owing</label>
              <input id="n4-amount" type="number" min="0" step="0.01" value={f.amount_owing} onChange={set("amount_owing")} />
            </div>
            <div className="field">
              <label htmlFor="n4-term">Termination date</label>
              <input id="n4-term" type="date" value={f.termination_date} onChange={set("termination_date")} />
            </div>
          </div>
          <p className="small">At least 14 days after service for a monthly tenancy. Add 5 days if you mail it.</p>
        </fieldset>
      ) : null}

      {kind === "N5" ? (
        <fieldset className="boxed stack">
          <legend className="sub-title">Reasons and details</legend>
          <div className="field">
            <label htmlFor="n5-number">Which notice is this?</label>
            <select id="n5-number" value={f.notice_number} onChange={set("notice_number")}>
              <option value="first">First notice (tenant can void it)</option>
              <option value="second">Second notice within six months</option>
            </select>
          </div>
          {N5_REASONS.map((r) => (
            <label key={r.value} className="check">
              <input type="checkbox" checked={f.reasons.includes(r.value)} onChange={() => toggleReason(r.value)} /> Reason {r.value}: {r.label}
            </label>
          ))}
          {f.reasons.includes(2) ? (
            <div className="row2">
              <div className="field">
                <label htmlFor="n5-repair">Cost to repair</label>
                <input id="n5-repair" type="number" min="0" step="0.01" value={f.repair_cost} onChange={set("repair_cost")} />
              </div>
              <div className="field">
                <label htmlFor="n5-replace">Cost to replace</label>
                <input id="n5-replace" type="number" min="0" step="0.01" value={f.replace_cost} onChange={set("replace_cost")} />
              </div>
            </div>
          ) : null}
          {f.reasons.includes(3) ? (
            <div className="field">
              <label htmlFor="n5-occ">Maximum number of occupants allowed</label>
              <input id="n5-occ" type="number" min="1" value={f.max_occupants} onChange={set("max_occupants")} />
            </div>
          ) : null}
          {f.events.map((ev, i) => (
            <div className="row2" key={i}>
              <div className="field">
                <label htmlFor={`e-when-${i}`}>Date and time</label>
                <input id={`e-when-${i}`} value={ev.when} placeholder="e.g. 2026/10/02, 11:30 pm" onChange={setRow("events", i, "when")} />
              </div>
              <div className="field">
                <label htmlFor={`e-det-${i}`}>What happened</label>
                <textarea id={`e-det-${i}`} rows={2} value={ev.details} onChange={setRow("events", i, "details")} />
              </div>
            </div>
          ))}
          {f.events.length < 3 ? (
            <button type="button" className="link-btn small" style={{ justifySelf: "start" }} onClick={() => setF((s) => ({ ...s, events: [...s.events, emptyEvent()] }))}>
              Add an event
            </button>
          ) : null}
          <div className="field">
            <label htmlFor="n5-term">Termination date</label>
            <input id="n5-term" type="date" value={f.termination_date} onChange={set("termination_date")} />
          </div>
          <p className="small">At least 20 days after service for a first notice, 14 days for a second.</p>
        </fieldset>
      ) : null}

      <SendButtons kind={kind} getForm={getForm} />
      <p className="small">Once it&apos;s signed, serve it from the request page and record the service there.</p>
    </form>
  );
}
