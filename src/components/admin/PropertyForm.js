"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import {
  FEE_RATE_KEYS,
  PACKAGE_LABEL,
  PROPERTY_SELECT,
  checkDollars,
  dollarsOrNull,
  orNull,
  standardFee,
  text,
} from "@/lib/admin-properties";
import { money } from "@/lib/format";
import AddressInput from "@/components/AddressInput";

const unitWord = (n) => (n === 1 ? "unit" : "units");

// End of a one-year term: Oct 1, 2026 -> Sep 30, 2027; Feb 29 -> Feb 28 next year.
export function oneYearTermEnd(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const end = m === 2 && d === 29 ? new Date(Date.UTC(y + 1, 1, 28)) : new Date(Date.UTC(y + 1, m - 1, d - 1));
  return end.toISOString().slice(0, 10);
}

function toForm(p, initialOwnerId) {
  return {
    address: text(p?.address),
    city: p ? text(p.city) : "Windsor",
    postal_code: text(p?.postal_code),
    owner_id: text(initialOwnerId || p?.owner_id),
    management_package: text(p?.management_package),
    unit_count: p?.unit_count ? String(p.unit_count) : "1",
    monthly_fee: text(p?.monthly_fee),
    fee_discount: p?.fee_discount != null ? String(Number(p.fee_discount)) : "0",
    fee_billed_separately: Boolean(p?.fee_billed_separately),
    agreement_start: text(p?.agreement_start),
    agreement_renewal: text(p?.agreement_renewal),
    promo_discount: p?.promo_discount != null ? String(Number(p.promo_discount)) : "0",
    promo_start: text(p?.promo_start),
    promo_end: text(p?.promo_end),
    promo_note: text(p?.promo_note),
    renewal_notice_sent_on: text(p?.renewal_notice_sent_on),
    lot_size_sqft: text(p?.lot_size_sqft),
    notes: text(p?.notes),
    archived: Boolean(p?.archived),
  };
}

function validUnits(value) {
  const s = String(value).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return n >= 1 && n <= 500 ? n : null;
}

const validDiscount = (v) => /^-?\d+(\.\d{1,2})?$/.test(String(v ?? "").trim() || "0");

function validate(f, isCustom) {
  if (!f.address.trim()) return "Add the street address.";
  if (!validUnits(f.unit_count)) return "Enter the number of units we bill for, from 1 to 500.";
  if (isCustom) {
    if (!f.monthly_fee.trim()) return "Enter the agreed monthly fee.";
    const fee = checkDollars(f.monthly_fee, "monthly management fee");
    if (fee) return fee;
  } else if (!validDiscount(f.fee_discount)) {
    return "Enter the discount in dollars, like 25 or 0. Use a minus sign for a surcharge.";
  }
  if (!/^\d+(\.\d{1,2})?$/.test(String(f.promo_discount).trim() || "0"))
    return "Enter the promo discount in dollars, like 25, or 0 for none.";
  if (f.promo_start && f.promo_end && f.promo_end < f.promo_start) return "The promo can't end before it starts.";
  if (f.agreement_start && f.agreement_renewal && f.agreement_renewal < f.agreement_start)
    return "The renewal date can't be before the agreement start date.";
  const lot = f.lot_size_sqft.trim();
  if (lot && !/^\d+$/.test(lot)) return "Enter the lot size in whole square feet, like 4500.";
  return "";
}

// Packages with a list price send the discount; the database works out the fee
// (base + extra units + add-ons - discount). Packages without one send the agreed fee.
function toRow(f, isCustom) {
  return {
    address: f.address.trim(),
    city: f.city.trim() || "Windsor",
    postal_code: f.postal_code.trim() ? f.postal_code.trim().toUpperCase() : null,
    owner_id: f.owner_id || null,
    management_package: f.management_package || null,
    unit_count: validUnits(f.unit_count),
    custom_fee: isCustom,
    ...(isCustom ? { monthly_fee: dollarsOrNull(f.monthly_fee) } : { fee_discount: Number(String(f.fee_discount).trim() || 0) }),
    fee_billed_separately: f.fee_billed_separately,
    agreement_start: f.agreement_start || null,
    agreement_renewal: f.agreement_renewal || (f.agreement_start ? oneYearTermEnd(f.agreement_start) : null),
    promo_discount: Number(String(f.promo_discount).trim() || 0),
    promo_start: Number(f.promo_discount) > 0 ? f.promo_start || null : null,
    promo_end: Number(f.promo_discount) > 0 ? f.promo_end || null : null,
    promo_note: Number(f.promo_discount) > 0 ? orNull(f.promo_note) : null,
    renewal_notice_sent_on: f.renewal_notice_sent_on || null,
    lot_size_sqft: f.lot_size_sqft.trim() ? parseInt(f.lot_size_sqft, 10) : null,
    notes: orNull(f.notes),
    archived: f.archived,
  };
}

export default function PropertyForm({ property, initialOwnerId, onSaved }) {
  const router = useRouter();
  const isNew = !property;
  const [form, setForm] = useState(() => toForm(property, initialOwnerId));
  const [owners, setOwners] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const [rates, setRates] = useState(null);
  const [addonsTotal, setAddonsTotal] = useState(isNew ? 0 : null);

  useEffect(() => {
    let alive = true;
    const sb = getBrowserClient();
    sb.from("owners")
      .select("id, name")
      .order("name")
      .then(({ data }) => alive && setOwners(data || []));
    sb.from("service_rates")
      .select("key, amount")
      .in("key", FEE_RATE_KEYS)
      .then(({ data }) => alive && setRates(Object.fromEntries((data || []).map((r) => [r.key, r.amount]))));
    if (property?.id)
      sb.rpc("property_addons_monthly", { p_property_id: property.id }).then(
        ({ data }) => alive && setAddonsTotal(Number(data || 0))
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const units = validUnits(form.unit_count);
  const hasListPrice = !["commercial", "leasing_only"].includes(form.management_package);
  const standard = units && hasListPrice ? standardFee(rates, form.management_package, units) : null;
  // Packages without a list price can only have an agreed fee (the database enforces the same).
  const isCustom = !hasListPrice;
  const perUnit = Number(rates?.additional_unit ?? 25);
  const base = standard !== null && units ? standard - perUnit * (units - 1) : null;
  const discount = validDiscount(form.fee_discount) ? Number(String(form.fee_discount).trim() || 0) : 0;
  const listPrice = standard !== null && addonsTotal !== null ? standard + addonsTotal : null;
  const feePreview = listPrice !== null ? Math.max(listPrice - discount, 0) : null;

  const update = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setMsg({ kind: "", text: "" });
  };

  async function save(e) {
    e.preventDefault();
    const problem = validate(form, isCustom);
    if (problem) return setMsg({ kind: "err", text: problem });
    setSaving(true);
    const sb = getBrowserClient();
    const row = toRow(form, isCustom);
    const result = isNew
      ? await sb.from("properties").insert(row).select("id").single()
      : await sb.from("properties").update(row).eq("id", property.id).select(PROPERTY_SELECT).single();
    if (result.error) {
      setSaving(false);
      return setMsg({ kind: "err", text: "We couldn't save this property. Check the fields and try again." });
    }
    if (isNew) {
      router.replace(`/admin/properties/${result.data.id}`);
      return;
    }
    setSaving(false);
    setForm(toForm(result.data));
    onSaved?.(result.data);
    setMsg({ kind: "ok", text: "Property saved." });
  }

  const backHere = isNew ? "/admin/properties/new" : `/admin/properties/${property.id}`;

  return (
    <form className="admin-form" onSubmit={save} noValidate>
      <section className="boxed stack" aria-labelledby="sec-property">
        <h2 id="sec-property" className="sec-title">
          Property
        </h2>
        <div className="field">
          <label htmlFor="p-address">Street address</label>
          <AddressInput
            id="p-address"
            value={form.address}
            onChange={(v) => setForm((f) => ({ ...f, address: v }))}
            onSelect={(a) => setForm((f) => ({ ...f, address: a.line || f.address, city: a.city || f.city, postal_code: a.postal_code || f.postal_code }))}
            placeholder="1234 Ouellette Ave"
            required
          />
        </div>
        <div className="row3">
          <div className="field">
            <label htmlFor="p-city">City</label>
            <input id="p-city" value={form.city} onChange={update("city")} />
          </div>
          <div className="field">
            <label htmlFor="p-postal">Postal code</label>
            <input id="p-postal" value={form.postal_code} onChange={update("postal_code")} placeholder="N9A 1A1" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="p-lot">Lot size (sq. ft.)</label>
            <input id="p-lot" inputMode="numeric" value={form.lot_size_sqft} onChange={update("lot_size_sqft")} placeholder="4500" />
          </div>
        </div>
      </section>

      <section className="boxed stack" aria-labelledby="sec-owner">
        <h2 id="sec-owner" className="sec-title">
          Owner
        </h2>
        <div className="field">
          <label htmlFor="p-owner">Owner</label>
          <select id="p-owner" value={form.owner_id} onChange={update("owner_id")} disabled={owners === null}>
            <option value="">{owners === null ? "Loading owners…" : "No owner set"}</option>
            {(owners || []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <p className="small">
          Not in the list?{" "}
          <Link href={`/admin/owners/new?back=${encodeURIComponent(backHere)}`}>Add a new owner</Link>
          {isNew ? ". You'll come back here, but anything typed above will need to be re-entered." : " and you'll come back here."}
        </p>
      </section>

      <section className="boxed stack" aria-labelledby="sec-contract">
        <h2 id="sec-contract" className="sec-title">
          Management agreement
        </h2>
        <div className="row2">
          <div className="field">
            <label htmlFor="p-package">Management package</label>
            <select id="p-package" value={form.management_package} onChange={update("management_package")}>
              <option value="">Not set</option>
              {Object.entries(PACKAGE_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-units">Units (for the management fee)</label>
            <input
              id="p-units"
              type="number"
              min="1"
              max="500"
              step="1"
              inputMode="numeric"
              value={form.unit_count}
              onChange={update("unit_count")}
              aria-describedby="p-units-help"
              required
            />
            <p id="p-units-help" className="small">
              {"The number of units we bill for. Extra unit records, leases or tenants don't change the fee."}
            </p>
          </div>
        </div>

        {isCustom ? (
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="p-fee">Agreed monthly fee before HST ($)</label>
            <input id="p-fee" inputMode="decimal" value={form.monthly_fee} onChange={update("monthly_fee")} placeholder="175" />
            <p className="small">This package has no list price, so enter the agreed fee.</p>
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <table className="data-table" style={{ maxWidth: 460 }}>
              <caption className="visually-hidden">How the monthly fee is worked out</caption>
              <tbody>
                <tr>
                  <th scope="row">Base fee (property and first unit)</th>
                  <td className="num">{base !== null ? money(base) : "…"}</td>
                </tr>
                <tr>
                  <th scope="row">
                    Additional units{units > 1 ? ` (${units - 1} × ${money(perUnit)})` : ""}
                  </th>
                  <td className="num">{units ? money(perUnit * (units - 1)) : "…"}</td>
                </tr>
                <tr>
                  <th scope="row">Add-ons (lawn/snow and others, set below)</th>
                  <td className="num">{addonsTotal !== null ? money(addonsTotal) : "…"}</td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="p-discount">Discount</label>
                  </th>
                  <td className="num">
                    <input
                      id="p-discount"
                      inputMode="decimal"
                      value={form.fee_discount}
                      onChange={update("fee_discount")}
                      style={{ maxWidth: 110, textAlign: "right" }}
                      aria-describedby="p-discount-help"
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">Monthly fee before HST</th>
                  <td className="num">
                    <b>{feePreview !== null ? money(feePreview) : "…"}</b>
                  </td>
                </tr>
              </tbody>
            </table>
            <p id="p-discount-help" className="small">
              The discount is taken off the list price every month. Use a minus sign for a surcharge. Adding or removing an
              add-on changes the fee straight away.
            </p>
          </div>
        )}

        <label className="check">
          <input type="checkbox" checked={form.fee_billed_separately} onChange={update("fee_billed_separately")} />
          Owner pays the management fee separately (not taken from rent)
        </label>
        <div className="row3">
          <div className="field">
            <label htmlFor="p-start">Agreement start</label>
            <input
              id="p-start"
              type="date"
              value={form.agreement_start}
              onChange={(e) => {
                const start = e.target.value;
                setForm((f) => {
                  // Keep the renewal in step unless staff typed a different one.
                  const auto = !f.agreement_renewal || f.agreement_renewal === oneYearTermEnd(f.agreement_start);
                  const promoAuto = !f.promo_start || f.promo_start === f.agreement_start;
                  return {
                    ...f,
                    agreement_start: start,
                    agreement_renewal: auto ? oneYearTermEnd(start) : f.agreement_renewal,
                    promo_start: Number(f.promo_discount) > 0 && promoAuto ? start : f.promo_start,
                    promo_end: Number(f.promo_discount) > 0 && promoAuto ? oneYearTermEnd(start) : f.promo_end,
                  };
                });
                setMsg({ kind: "", text: "" });
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="p-renewal">Agreement renewal</label>
            <input id="p-renewal" type="date" value={form.agreement_renewal} onChange={update("agreement_renewal")} aria-describedby="p-renewal-help" />
            <span id="p-renewal-help" className="small">Set to one year after the start. Change it if the agreement says otherwise.</span>
          </div>
          <div className="field">
            <label htmlFor="p-notice">Renewal notice sent on</label>
            <input id="p-notice" type="date" value={form.renewal_notice_sent_on} onChange={update("renewal_notice_sent_on")} />
          </div>
        </div>
        <fieldset className="field boxed stack" style={{ gap: 10 }}>
          <legend>First-year promo (optional)</legend>
          <div className="row3">
            <div className="field">
              <label htmlFor="p-promo">Promo discount ($/month off the fee)</label>
              <input
                id="p-promo"
                inputMode="decimal"
                value={form.promo_discount}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({
                    ...f,
                    promo_discount: v,
                    promo_start: Number(v) > 0 && !f.promo_start ? f.agreement_start : f.promo_start,
                    promo_end: Number(v) > 0 && !f.promo_end && f.agreement_start ? oneYearTermEnd(f.agreement_start) : f.promo_end,
                  }));
                }}
              />
            </div>
            {Number(form.promo_discount) > 0 ? (
              <>
                <div className="field">
                  <label htmlFor="p-promo-start">Promo starts</label>
                  <input id="p-promo-start" type="date" value={form.promo_start} onChange={update("promo_start")} />
                </div>
                <div className="field">
                  <label htmlFor="p-promo-end">Promo ends</label>
                  <input id="p-promo-end" type="date" value={form.promo_end} onChange={update("promo_end")} />
                </div>
              </>
            ) : null}
          </div>
          {Number(form.promo_discount) > 0 ? (
            <>
              <div className="field">
                <label htmlFor="p-promo-note">Promo note (optional)</label>
                <input id="p-promo-note" value={form.promo_note} onChange={update("promo_note")} placeholder="e.g. Fall 2026 sign-up offer" />
              </div>
              <p className="small">
                Statements charge {feePreview !== null ? money(Math.max(feePreview - Number(form.promo_discount), 0)) : "the lower fee"} + HST
                during the promo, then go back to {feePreview !== null ? money(feePreview) : "the regular fee"}. It defaults to the first
                year of the agreement.
              </p>
            </>
          ) : (
            <p className="small">A dollar amount off the monthly fee for a set time, usually the first year.</p>
          )}
        </fieldset>
        <div className="field">
          <label htmlFor="p-notes">Staff notes</label>
          <textarea id="p-notes" value={form.notes} onChange={update("notes")} placeholder="Access, lockbox, owner preferences…" />
        </div>
        {!isNew ? (
          <label className="check">
            <input type="checkbox" checked={form.archived} onChange={update("archived")} />
            Archived (hidden from the properties list)
          </label>
        ) : null}
      </section>

      <div className="req-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Saving…" : isNew ? "Add property" : "Save property"}
        </button>
        {msg.text ? (
          <span className={`small ${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>
            {msg.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
