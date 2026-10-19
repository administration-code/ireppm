"use client";

import { useEffect, useMemo, useState } from "react";
import SendButtons from "@/components/admin/signatures/SendButtons";
import { MAX_OWNERS, looksCorporate, pmContractFees } from "@/lib/docusign-templates";
import { placeOf } from "@/lib/signature-context";
import { getBrowserClient } from "@/lib/supabase";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const money = (n) => `$${Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ADDON_NAMES = { snow_lawn: "Lawn & snow (monthly)", surveillance: "Security package", appliance: "Appliance coverage", plumbing: "Plumbing package", cleaning: "Common space cleaning" };

// A first-year promo that's still running is offered as the contract's first-year discount.
function promoNow(p) {
  const amount = Number(p?.promo_discount) || 0;
  if (!amount) return 0;
  const t = today();
  if (p.promo_end && p.promo_end < t) return 0;
  return amount;
}

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
  const [c, setC] = useState(() => ({
    effective_date: today(),
    engagement: "new",
    managed_since: "",
    corporation_name: "",
    corporation_number: "",
    notice_address: ctx.owner?.mailing_address || "",
    property_address: p?.address || "",
    city_postal: [p?.city ? `${p.city}, ON` : "", p?.postal_code || ""].filter(Boolean).join(" "),
    leases: String(p?.unit_count || 1),
    monthly_discount: String(promoNow(p) || ""),
    response_time: "48 hours",
  }));
  const setField = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.value }));
  const [fillLeases, setFillLeases] = useState(true);
  const [leaseRows, setLeaseRows] = useState(null);
  const [addons, setAddons] = useState([]);
  useEffect(() => {
    if (!p?.id) return;
    getBrowserClient()
      .from("property_addons")
      .select("addon_key")
      .eq("property_id", p.id)
      .then(({ data }) => setAddons((data || []).map((a) => a.addon_key)));
    getBrowserClient()
      .from("units")
      .select("label, status, tenancies(status, tenancy_tenants(full_name))")
      .eq("property_id", p.id)
      .then(({ data }) =>
        setLeaseRows(
          (data || [])
            .filter((u) => u.status !== "offline")
            .sort((a, b) => String(a.label).localeCompare(String(b.label), "en", { numeric: true }))
            .map((u) => {
              const t = (u.tenancies || []).find((x) => ["active", "notice"].includes(x.status));
              return `${u.label}: ${t ? (t.tenancy_tenants || []).map((x) => x.full_name).filter(Boolean).join(", ") || "Tenant" : "Vacant"}`;
            })
        )
      );
  }, [p?.id]);
  const fees = useMemo(
    () => pmContractFees({ leases: c.leases, addons, monthlyDiscount: c.monthly_discount, customFee: p?.custom_fee ? p.monthly_fee : null }),
    [c.leases, c.monthly_discount, addons, p?.custom_fee, p?.monthly_fee]
  );

  const getForm = () => {
    if (!p?.id) throw new Error("Start the contract from a property page.");
    return {
      place: p.address,
      property_id: p.id,
      owner_id: p.owner_id || null,
      owners: owners.filter((o) => o.name.trim() || o.email.trim()),
      corporation,
      ...dates,
      contract: {
        ...c,
        commencement_date: dates.agreement_start,
        corporation_name: corporation ? c.corporation_name || owners[0]?.name || "" : "",
        corporation_number: corporation ? c.corporation_number : "",
        monthly_discount: Number(c.monthly_discount) || 0,
        fill_leases: fillLeases,
        custom_fee: p?.custom_fee ? Number(p.monthly_fee) || null : null,
      },
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
        {corporation ? (
          <div className="row2">
            <div className="field">
              <label htmlFor="pm-corp">Corporation name</label>
              <input id="pm-corp" value={c.corporation_name} placeholder={owners[0]?.name || ""} onChange={setField("corporation_name")} />
            </div>
            <div className="field">
              <label htmlFor="pm-corpno">Corporation number (optional)</label>
              <input id="pm-corpno" value={c.corporation_number} onChange={setField("corporation_number")} />
            </div>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="pm-notice">Landlord&apos;s address for notices</label>
          <input id="pm-notice" value={c.notice_address} onChange={setField("notice_address")} />
        </div>
      </fieldset>

      <fieldset className="boxed stack">
        <legend className="sub-title">Contract details</legend>
        <div className="row2">
          <div className="field">
            <label htmlFor="pm-addr">Property address</label>
            <input id="pm-addr" value={c.property_address} onChange={setField("property_address")} />
          </div>
          <div className="field">
            <label htmlFor="pm-city">City / postal code</label>
            <input id="pm-city" value={c.city_postal} onChange={setField("city_postal")} />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="pm-eff">Effective date (date the contract is made)</label>
            <input id="pm-eff" type="date" value={c.effective_date} onChange={setField("effective_date")} />
          </div>
          <div className="field">
            <label htmlFor="pm-resp">Approval response time (section 7.2)</label>
            <input id="pm-resp" value={c.response_time} onChange={setField("response_time")} />
          </div>
        </div>
        <div className="field">
          <span className="label">Engagement type</span>
          <label className="check">
            <input type="radio" name="pm-eng" checked={c.engagement === "new"} onChange={() => setC((x) => ({ ...x, engagement: "new" }))} />
            New engagement: a fresh 12-month Initial Term and the first-year discount (also for existing landlords moving to this contract)
          </label>
          <label className="check">
            <input type="radio" name="pm-eng" checked={c.engagement === "resign"} onChange={() => setC((x) => ({ ...x, engagement: "resign" }))} />
            Re-signing an existing landlord (section 2.10(b) or 2.11)
          </label>
        </div>
        {c.engagement === "resign" ? (
          <div className="field">
            <label htmlFor="pm-since">Managed since</label>
            <input id="pm-since" type="date" value={c.managed_since} onChange={setField("managed_since")} />
          </div>
        ) : null}
        <div className="row2">
          <div className="field">
            <label htmlFor="pm-leases">Leases anticipated</label>
            <input id="pm-leases" inputMode="numeric" value={c.leases} onChange={setField("leases")} />
          </div>
          <div className="field">
            <label htmlFor="pm-disc">First-year discount per month (blank for none)</label>
            <input id="pm-disc" inputMode="decimal" value={c.monthly_discount} onChange={setField("monthly_discount")} />
          </div>
        </div>
        <p className="small" style={{ margin: 0 }}>
          Schedule A: management {money(fees.management)}
          {Object.entries(fees.services).map(([k, v]) => `, ${ADDON_NAMES[k] || k} ${money(v)}`).join("")}
          {fees.discount ? `, less ${money(fees.discount)} discount` : ""} = {money(fees.subtotal)} + HST {money(fees.hst)} ={" "}
          <strong>{money(fees.total)}</strong> a month. Optional services come from the property&apos;s add-ons.
        </p>
        <label className="check">
          <input type="checkbox" checked={fillLeases} onChange={(e) => setFillLeases(e.target.checked)} />
          Fill the lease schedule (Schedule A, Part 5) from the current tenants
        </label>
        {fillLeases && leaseRows ? (
          <p className="small" style={{ margin: 0 }}>
            {leaseRows.length
              ? `${leaseRows.slice(0, 12).join(" · ")}${leaseRows.length > 12 ? ` (first 12 of ${leaseRows.length} units)` : ""}. The landlord can correct these before signing.`
              : "No units are set up for this property yet, so the schedule will be left blank."}
          </p>
        ) : null}
        <p className="small" style={{ margin: 0 }}>
          Everything above is printed into the contract, along with initials on every page for every owner and Chuck, the phone
          numbers, the corporation and multiple-owner boxes, and the Schedule A service boxes. Check it in DocuSign, then send.
        </p>
        <div className="row2">
          <div className="field">
            <label htmlFor="pm-start">Commencement date (agreement start)</label>
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
