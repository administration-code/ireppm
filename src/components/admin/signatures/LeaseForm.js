"use client";

import { useState } from "react";
import SendButtons from "@/components/admin/signatures/SendButtons";
import { MAX_TENANTS, leaseTotal } from "@/lib/docusign-templates";
import { LEASE_DEFAULTS } from "@/lib/lease-defaults";
import { baseFields, tenantsOf } from "@/lib/signature-context";

export default function LeaseForm({ ctx }) {
  const t = ctx.tenancy;
  const [f, setF] = useState(() => ({
    ...baseFields(ctx),
    tenants: tenantsOf(ctx),
    start_date: t?.start_date || "",
    term: t?.end_date ? "fixed" : "monthly",
    end_date: t?.end_date || "",
    base_rent: t?.rent ?? ctx.unit?.market_rent ?? "",
    parking_rent: "",
    parking: "",
    rent_due_day: t?.rent_due_day || 1,
    rent_deposit: t?.last_month_deposit ?? t?.rent ?? "",
    key_deposit: t?.key_deposit ?? "",
    condo: false,
    guarantor_name: "",
    guarantor_email: "",
    rent_payable_to: LEASE_DEFAULTS.rentPayableTo,
    payment_methods: LEASE_DEFAULTS.paymentMethods,
    signer: { mode: "owner", name: "", email: "" },
  }));
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const setTenant = (i, k) => (e) =>
    setF((s) => ({ ...s, tenants: s.tenants.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }));
  const setSigner = (k) => (e) => setF((s) => ({ ...s, signer: { ...s.signer, [k]: e.target.value } }));

  const getForm = () => {
    if (!f.unit_id) throw new Error("This lease isn't linked to a unit. Start it from the unit page.");
    return { ...f, tenants: f.tenants.filter((x) => x.full_name.trim() || x.email.trim()) };
  };

  return (
    <form className="stack" style={{ gap: 20 }} onSubmit={(e) => e.preventDefault()}>
      <fieldset className="boxed stack">
        <legend className="sub-title">Tenants</legend>
        {f.tenants.map((x, i) => (
          <div className="row2" key={i}>
            <div className="field">
              <label htmlFor={`t-name-${i}`}>Tenant {i + 1} full legal name</label>
              <input id={`t-name-${i}`} value={x.full_name} onChange={setTenant(i, "full_name")} />
            </div>
            <div className="field">
              <label htmlFor={`t-email-${i}`}>Email</label>
              <input id={`t-email-${i}`} type="email" value={x.email} onChange={setTenant(i, "email")} />
            </div>
          </div>
        ))}
        <div className="req-actions">
          {f.tenants.length < MAX_TENANTS ? (
            <button type="button" className="link-btn small" onClick={() => setF((s) => ({ ...s, tenants: [...s.tenants, { full_name: "", email: "" }] }))}>
              Add a tenant
            </button>
          ) : null}
          {f.tenants.length > 1 ? (
            <button type="button" className="link-btn small" onClick={() => setF((s) => ({ ...s, tenants: s.tenants.slice(0, -1) }))}>
              Remove last
            </button>
          ) : null}
        </div>
        <p className="small">Each tenant also gets the Consent to Service by Email form in the same envelope.</p>
      </fieldset>

      <fieldset className="boxed stack">
        <legend className="sub-title">Term and rent</legend>
        <div className="row3">
          <div className="field">
            <label htmlFor="l-start">Start date</label>
            <input id="l-start" type="date" value={f.start_date} onChange={set("start_date")} />
          </div>
          <div className="field">
            <label htmlFor="l-term">Term</label>
            <select id="l-term" value={f.term} onChange={set("term")}>
              <option value="fixed">Fixed term</option>
              <option value="monthly">Month-to-month</option>
            </select>
          </div>
          {f.term === "fixed" ? (
            <div className="field">
              <label htmlFor="l-end">End date</label>
              <input id="l-end" type="date" value={f.end_date} onChange={set("end_date")} />
            </div>
          ) : null}
        </div>
        <div className="row3">
          <div className="field">
            <label htmlFor="l-rent">Base rent ($/month)</label>
            <input id="l-rent" type="number" min="0" step="0.01" value={f.base_rent} onChange={set("base_rent")} />
          </div>
          <div className="field">
            <label htmlFor="l-parking-rent">Parking ($/month)</label>
            <input id="l-parking-rent" type="number" min="0" step="0.01" value={f.parking_rent} onChange={set("parking_rent")} />
          </div>
          <div className="field">
            <label htmlFor="l-due">Rent due day</label>
            <input id="l-due" type="number" min="1" max="31" value={f.rent_due_day} onChange={set("rent_due_day")} />
          </div>
        </div>
        <p className="small">Total monthly rent: ${leaseTotal(f).toFixed(2)}</p>
        <div className="row3">
          <div className="field">
            <label htmlFor="l-parking">Parking spaces (description)</label>
            <input id="l-parking" value={f.parking} onChange={set("parking")} />
          </div>
          <div className="field">
            <label htmlFor="l-lmr">Last month&apos;s rent deposit</label>
            <input id="l-lmr" type="number" min="0" step="0.01" value={f.rent_deposit} onChange={set("rent_deposit")} />
          </div>
          <div className="field">
            <label htmlFor="l-key">Key deposit</label>
            <input id="l-key" type="number" min="0" step="0.01" value={f.key_deposit} onChange={set("key_deposit")} />
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.condo} onChange={set("condo")} /> The unit is in a condominium
        </label>
      </fieldset>

      <fieldset className="boxed stack">
        <legend className="sub-title">Landlord and signing</legend>
        <div className="row2">
          <div className="field">
            <label htmlFor="l-landlord">Landlord legal name</label>
            <input id="l-landlord" value={f.landlord_name} onChange={set("landlord_name")} />
          </div>
        </div>
        <p className="small">The landlord signs the lease. Leave these blank to use the owner on file.</p>
        {f.signer.mode === "owner" ? (
          <div className="row2">
            <div className="field">
              <label htmlFor="l-sname">Owner signer name</label>
              <input id="l-sname" value={f.signer.name} placeholder={ctx.owner?.name || ""} onChange={setSigner("name")} />
            </div>
            <div className="field">
              <label htmlFor="l-semail">Owner signer email</label>
              <input id="l-semail" type="email" value={f.signer.email} placeholder={ctx.owner?.email || ""} onChange={setSigner("email")} />
            </div>
          </div>
        ) : null}
        <div className="row2">
          <div className="field">
            <label htmlFor="l-gname">Guarantor name (optional)</label>
            <input id="l-gname" value={f.guarantor_name} onChange={set("guarantor_name")} />
          </div>
          <div className="field">
            <label htmlFor="l-gemail">Guarantor email</label>
            <input id="l-gemail" type="email" value={f.guarantor_email} onChange={set("guarantor_email")} />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="l-payto">Rent payable to</label>
            <input id="l-payto" value={f.rent_payable_to} onChange={set("rent_payable_to")} />
          </div>
          <div className="field">
            <label htmlFor="l-paymethods">Payment methods</label>
            <input id="l-paymethods" value={f.payment_methods} onChange={set("payment_methods")} />
          </div>
        </div>
        <p className="small">Utilities, services and other terms are left for you to complete when you review in DocuSign.</p>
      </fieldset>

      <SendButtons kind="lease" getForm={getForm} />
    </form>
  );
}
