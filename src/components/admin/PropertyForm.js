"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { PACKAGE_LABEL, PROPERTY_SELECT, checkDollars, dollarsOrNull, orNull, text } from "@/lib/admin-properties";

function toForm(p, initialOwnerId) {
  return {
    address: text(p?.address),
    city: p ? text(p.city) : "Windsor",
    postal_code: text(p?.postal_code),
    owner_id: text(initialOwnerId || p?.owner_id),
    management_package: text(p?.management_package),
    monthly_fee: text(p?.monthly_fee),
    agreement_start: text(p?.agreement_start),
    agreement_renewal: text(p?.agreement_renewal),
    renewal_notice_sent_on: text(p?.renewal_notice_sent_on),
    lot_size_sqft: text(p?.lot_size_sqft),
    notes: text(p?.notes),
    archived: Boolean(p?.archived),
  };
}

function validate(f) {
  if (!f.address.trim()) return "Add the street address.";
  const fee = checkDollars(f.monthly_fee, "monthly management fee");
  if (fee) return fee;
  if (f.agreement_start && f.agreement_renewal && f.agreement_renewal < f.agreement_start)
    return "The renewal date can't be before the agreement start date.";
  const lot = f.lot_size_sqft.trim();
  if (lot && !/^\d+$/.test(lot)) return "Enter the lot size in whole square feet, like 4500.";
  return "";
}

function toRow(f) {
  return {
    address: f.address.trim(),
    city: f.city.trim() || "Windsor",
    postal_code: f.postal_code.trim() ? f.postal_code.trim().toUpperCase() : null,
    owner_id: f.owner_id || null,
    management_package: f.management_package || null,
    monthly_fee: dollarsOrNull(f.monthly_fee),
    agreement_start: f.agreement_start || null,
    agreement_renewal: f.agreement_renewal || null,
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

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("owners")
      .select("id, name")
      .order("name")
      .then(({ data }) => alive && setOwners(data || []));
    return () => {
      alive = false;
    };
  }, []);

  const update = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setMsg({ kind: "", text: "" });
  };

  async function save(e) {
    e.preventDefault();
    const problem = validate(form);
    if (problem) return setMsg({ kind: "err", text: problem });
    setSaving(true);
    const sb = getBrowserClient();
    const row = toRow(form);
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
          <input id="p-address" value={form.address} onChange={update("address")} placeholder="1234 Ouellette Ave" required />
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
            <label htmlFor="p-fee">Monthly fee before HST ($)</label>
            <input id="p-fee" inputMode="decimal" value={form.monthly_fee} onChange={update("monthly_fee")} placeholder="175" />
          </div>
        </div>
        <p className="small">The monthly fee is the all-in amount billed to the owner. Add-ons below show what it includes.</p>
        <div className="row3">
          <div className="field">
            <label htmlFor="p-start">Agreement start</label>
            <input id="p-start" type="date" value={form.agreement_start} onChange={update("agreement_start")} />
          </div>
          <div className="field">
            <label htmlFor="p-renewal">Agreement renewal</label>
            <input id="p-renewal" type="date" value={form.agreement_renewal} onChange={update("agreement_renewal")} />
          </div>
          <div className="field">
            <label htmlFor="p-notice">Renewal notice sent on</label>
            <input id="p-notice" type="date" value={form.renewal_notice_sent_on} onChange={update("renewal_notice_sent_on")} />
          </div>
        </div>
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
