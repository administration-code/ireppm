"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import ContactLine from "@/components/admin/ContactLine";
import { PACKAGE_LABEL, PROPERTY_FIELDS, orNull, text } from "@/lib/admin-properties";

function toForm(p) {
  return {
    address: text(p?.address),
    city: p ? text(p.city) : "Windsor",
    postal_code: text(p?.postal_code),
    owner_name: text(p?.owner_name),
    owner_email: text(p?.owner_email),
    owner_phone: text(p?.owner_phone),
    management_package: text(p?.management_package),
    notes: text(p?.notes),
    archived: Boolean(p?.archived),
  };
}

function validate(f) {
  if (!f.address.trim()) return "Add the street address.";
  if (f.owner_email.trim() && !/^\S+@\S+\.\S+$/.test(f.owner_email.trim())) return "Check the owner's email address.";
  return "";
}

function toRow(f) {
  return {
    address: f.address.trim(),
    city: f.city.trim() || "Windsor",
    postal_code: f.postal_code.trim() ? f.postal_code.trim().toUpperCase() : null,
    owner_name: orNull(f.owner_name),
    owner_email: orNull(f.owner_email),
    owner_phone: orNull(f.owner_phone),
    management_package: f.management_package || null,
    notes: orNull(f.notes),
    archived: f.archived,
  };
}

export default function PropertyForm({ property, onSaved }) {
  const router = useRouter();
  const isNew = !property;
  const [form, setForm] = useState(() => toForm(property));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

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
      : await sb.from("properties").update(row).eq("id", property.id).select(PROPERTY_FIELDS).single();
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
        </div>
      </section>

      <section className="boxed stack" aria-labelledby="sec-owner">
        <h2 id="sec-owner" className="sec-title">
          Owner contact
        </h2>
        <p className="small">Only staff can see the owner&apos;s details.</p>
        <div className="row3">
          <div className="field">
            <label htmlFor="p-owner">Owner name</label>
            <input id="p-owner" value={form.owner_name} onChange={update("owner_name")} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="p-owner-email">Owner email</label>
            <input id="p-owner-email" type="email" value={form.owner_email} onChange={update("owner_email")} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="p-owner-phone">Owner phone</label>
            <input id="p-owner-phone" type="tel" value={form.owner_phone} onChange={update("owner_phone")} autoComplete="off" />
          </div>
        </div>
        {!isNew && (property.owner_phone || property.owner_email) ? (
          <ContactLine phone={property.owner_phone} email={property.owner_email} />
        ) : null}
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
