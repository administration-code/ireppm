"use client";

import { useState } from "react";
import SendButtons from "@/components/admin/signatures/SendButtons";
import { MAX_OWNERS, looksCorporate } from "@/lib/docusign-templates";
import { placeOf } from "@/lib/signature-context";

export default function PmContractForm({ ctx }) {
  const p = ctx.property;
  const [owners, setOwners] = useState(() => [
    {
      name: ctx.owner?.name || p?.owner_name || "",
      email: ctx.owner?.email || p?.owner_email || "",
      phone: ctx.owner?.phone || p?.owner_phone || "",
    },
  ]);
  const [corporation, setCorporation] = useState(() => looksCorporate(ctx.owner?.name || p?.owner_name || ""));
  const [dates, setDates] = useState({ agreement_start: p?.agreement_start || "", agreement_renewal: p?.agreement_renewal || "" });
  const setOwner = (i, k) => (e) => setOwners((list) => list.map((o, j) => (j === i ? { ...o, [k]: e.target.value } : o)));

  const getForm = () => {
    if (!p?.id) throw new Error("Start the contract from a property page.");
    return {
      place: p.address,
      property_id: p.id,
      owner_id: p.owner_id || null,
      owners: owners.filter((o) => o.name.trim() || o.email.trim()),
      corporation,
      ...dates,
    };
  };

  return (
    <form className="stack" style={{ gap: 20 }} onSubmit={(e) => e.preventDefault()}>
      <fieldset className="boxed stack">
        <legend className="sub-title">Owner signers for {placeOf(ctx) || "this property"}</legend>
        {owners.map((o, i) => (
          <div className="row3" key={i}>
            <div className="field">
              <label htmlFor={`o-name-${i}`}>{i === 0 ? "Owner 1 (authorized signatory) name" : `Owner ${i + 1} name`}</label>
              <input id={`o-name-${i}`} value={o.name} onChange={setOwner(i, "name")} />
            </div>
            <div className="field">
              <label htmlFor={`o-email-${i}`}>Email</label>
              <input id={`o-email-${i}`} type="email" value={o.email} onChange={setOwner(i, "email")} />
            </div>
            <div className="field">
              <label htmlFor={`o-phone-${i}`}>Phone</label>
              <input id={`o-phone-${i}`} type="tel" value={o.phone || ""} onChange={setOwner(i, "phone")} />
            </div>
          </div>
        ))}
        <div className="req-actions">
          {owners.length < MAX_OWNERS ? (
            <button type="button" className="link-btn small" onClick={() => setOwners((l) => [...l, { name: "", email: "", phone: "" }])}>
              Add an owner
            </button>
          ) : null}
          {owners.length > 1 ? (
            <button type="button" className="link-btn small" onClick={() => setOwners((l) => l.slice(0, -1))}>
              Remove last
            </button>
          ) : null}
        </div>
        <label className="check">
          <input type="checkbox" checked={corporation} onChange={(e) => setCorporation(e.target.checked)} />
          The landlord is a corporation (ticks the corporation box under the landlord&apos;s signature)
        </label>
        <p className="small" style={{ margin: 0 }}>
          The contract also gets initials on pages 1 to 14 for every owner and Chuck, the owners&apos; phone numbers on
          page 1, IRep&apos;s phone number on page 2, the multiple-owners box when there&apos;s more than one owner, and the Schedule A
          service boxes ticked from the property&apos;s add-ons.
        </p>
        <div className="row2">
          <div className="field">
            <label htmlFor="pm-start">Agreement start</label>
            <input id="pm-start" type="date" value={dates.agreement_start} onChange={(e) => setDates((d) => ({ ...d, agreement_start: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="pm-renew">Renewal date</label>
            <input id="pm-renew" type="date" value={dates.agreement_renewal} onChange={(e) => setDates((d) => ({ ...d, agreement_renewal: e.target.value }))} />
          </div>
        </div>
      </fieldset>
      <SendButtons kind="pm_contract" getForm={getForm} />
    </form>
  );
}
