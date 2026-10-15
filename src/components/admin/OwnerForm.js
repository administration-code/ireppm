"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { OWNER_FIELDS, OWNER_TYPES, orNull, text } from "@/lib/admin-properties";

function toForm(o) {
  return {
    name: text(o?.name),
    entity_type: o?.entity_type || "individual",
    email: text(o?.email),
    phone: text(o?.phone),
    mailing_address: text(o?.mailing_address),
    payout_method: text(o?.payout_method),
    notes: text(o?.notes),
  };
}

function validate(f) {
  if (!f.name.trim()) return "Add the owner's name.";
  if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) return "Check the owner's email address.";
  return "";
}

function toRow(f) {
  return {
    name: f.name.trim(),
    entity_type: f.entity_type,
    email: orNull(f.email),
    phone: orNull(f.phone),
    mailing_address: orNull(f.mailing_address),
    payout_method: orNull(f.payout_method),
    notes: orNull(f.notes),
  };
}

// Only same-site staff paths are allowed as a return destination.
const safeBack = (back) => (typeof back === "string" && /^\/admin\/[\w/-]*$/.test(back) ? back : "");

export default function OwnerForm({ owner, back, onSaved }) {
  const router = useRouter();
  const isNew = !owner;
  const [form, setForm] = useState(() => toForm(owner));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
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
      ? await sb.from("owners").insert(row).select("id").single()
      : await sb.from("owners").update(row).eq("id", owner.id).select(OWNER_FIELDS).single();
    if (result.error) {
      setSaving(false);
      return setMsg({ kind: "err", text: "We couldn't save this owner. Check the fields and try again." });
    }
    if (isNew) {
      const to = safeBack(back);
      router.replace(to ? `${to}${to.includes("?") ? "&" : "?"}owner=${result.data.id}` : `/admin/owners/${result.data.id}`);
      return;
    }
    setSaving(false);
    setForm(toForm(result.data));
    onSaved?.(result.data);
    setMsg({ kind: "ok", text: "Owner saved." });
  }

  return (
    <form className="admin-form" onSubmit={save} noValidate>
      <section className="boxed stack" aria-labelledby="sec-owner">
        <h2 id="sec-owner" className="sec-title">
          Owner
        </h2>
        <p className="small">Only staff can see owner details.</p>
        <div className="row2">
          <div className="field">
            <label htmlFor="o-name">Name</label>
            <input id="o-name" value={form.name} onChange={update("name")} autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="o-type">Type</label>
            <select id="o-type" value={form.entity_type} onChange={update("entity_type")}>
              {Object.entries(OWNER_TYPES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="o-email">Email</label>
            <input id="o-email" type="email" value={form.email} onChange={update("email")} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="o-phone">Phone</label>
            <input id="o-phone" type="tel" value={form.phone} onChange={update("phone")} autoComplete="off" />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="o-mail">Mailing address</label>
            <textarea id="o-mail" value={form.mailing_address} onChange={update("mailing_address")} rows={2} />
          </div>
          <div className="field">
            <label htmlFor="o-payout">Payout method</label>
            <input id="o-payout" value={form.payout_method} onChange={update("payout_method")} placeholder="EFT, cheque…" autoComplete="off" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="o-notes">Staff notes</label>
          <textarea id="o-notes" value={form.notes} onChange={update("notes")} />
        </div>
      </section>

      <div className="req-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Saving…" : isNew ? "Add owner" : "Save owner"}
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
