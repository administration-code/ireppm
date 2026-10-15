"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { orNull, text } from "@/lib/admin-properties";
import { CATEGORIES } from "@/lib/maintenance";

export const PARTNER_FIELDS = "id, name, company, trades, email, phone, notes, active";

function toForm(p) {
  return {
    name: text(p?.name),
    company: text(p?.company),
    trades: p?.trades || [],
    email: text(p?.email),
    phone: text(p?.phone),
    notes: text(p?.notes),
    active: p ? Boolean(p.active) : true,
  };
}

export default function PartnerForm({ partner, onSaved }) {
  const router = useRouter();
  const isNew = !partner;
  const [form, setForm] = useState(() => toForm(partner));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMsg({ kind: "", text: "" });
  };
  const update = (key) => (e) => set(key, e.target.value);
  const toggleTrade = (trade) =>
    set("trades", form.trades.includes(trade) ? form.trades.filter((t) => t !== trade) : [...form.trades, trade]);

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return setMsg({ kind: "err", text: "Add the partner's name." });
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim()))
      return setMsg({ kind: "err", text: "Check the partner's email address." });
    setSaving(true);
    const row = {
      name: form.name.trim(),
      company: orNull(form.company),
      trades: Object.keys(CATEGORIES).filter((k) => form.trades.includes(k)),
      email: orNull(form.email),
      phone: orNull(form.phone),
      notes: orNull(form.notes),
      active: form.active,
    };
    const sb = getBrowserClient();
    const result = isNew
      ? await sb.from("partners").insert(row).select("id").single()
      : await sb.from("partners").update(row).eq("id", partner.id).select(PARTNER_FIELDS).single();
    if (result.error) {
      setSaving(false);
      return setMsg({ kind: "err", text: "We couldn't save this partner. Check the fields and try again." });
    }
    if (isNew) return router.replace(`/admin/partners/${result.data.id}`);
    setSaving(false);
    setForm(toForm(result.data));
    onSaved?.(result.data);
    setMsg({ kind: "ok", text: "Partner saved." });
  }

  return (
    <form className="admin-form" onSubmit={save} noValidate>
      <section className="boxed stack" aria-labelledby="sec-partner">
        <h2 id="sec-partner" className="sec-title">
          Partner
        </h2>
        <div className="row2">
          <div className="field">
            <label htmlFor="p-name">Name</label>
            <input id="p-name" value={form.name} onChange={update("name")} autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="p-company">Company</label>
            <input id="p-company" value={form.company} onChange={update("company")} autoComplete="off" />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="p-email">Email</label>
            <input id="p-email" type="email" value={form.email} onChange={update("email")} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="p-phone">Phone</label>
            <input id="p-phone" type="tel" value={form.phone} onChange={update("phone")} autoComplete="off" />
          </div>
        </div>
        <fieldset className="check-group">
          <legend>Trades</legend>
          <div className="check-grid">
            {Object.entries(CATEGORIES).map(([k, l]) => (
              <label key={k} className="check-line">
                <input type="checkbox" checked={form.trades.includes(k)} onChange={() => toggleTrade(k)} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="p-notes">Notes</label>
          <textarea id="p-notes" value={form.notes} onChange={update("notes")} />
        </div>
        <label className="check-line">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          Active (shown when assigning jobs)
        </label>
      </section>

      <div className="req-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Saving…" : isNew ? "Add partner" : "Save partner"}
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
