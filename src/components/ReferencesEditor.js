"use client";

import { useState } from "react";
import AddressInput from "@/components/AddressInput";
import { REFERENCE_KINDS } from "@/lib/documents";

const FIELDS = ["name", "phone", "email", "address", "since", "until", "relationship", "title"];
const isLandlord = (kind) => kind === "current_landlord" || kind === "previous_landlord";

function cardsFrom(references) {
  const list = Array.isArray(references) ? references : [];
  return Object.fromEntries(
    REFERENCE_KINDS.map(({ key }) => {
      const r = list.find((x) => x?.kind === key) || {};
      return [key, Object.fromEntries(FIELDS.map((f) => [f, r[f] || ""]))];
    })
  );
}

// Cards with no name are left out of what's saved.
function toSaved(cards) {
  return REFERENCE_KINDS.map(({ key }) => ({ kind: key, ...cards[key] }))
    .filter((c) => c.name.trim())
    .map((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, k === "kind" ? v : String(v).trim() || null])));
}

export default function ReferencesEditor({ references, onSave }) {
  const [cards, setCards] = useState(() => cardsFrom(references));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(toSaved(cards)) !== JSON.stringify(toSaved(cardsFrom(references)));

  const set = (kind, field) => (value) => {
    setCards((c) => ({ ...c, [kind]: { ...c[kind], [field]: value } }));
    setSaved(false);
  };

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    await onSave({ rental_references: toSaved(cards) });
    setSaving(false);
    setSaved(true);
  }

  return (
    <form className="boxed stack" style={{ gap: 14 }} onSubmit={save} aria-labelledby="refs-title">
      <div style={{ display: "grid", gap: 4 }}>
        <h3 id="refs-title">References</h3>
        <p className="small">Optional, but strongly recommended. Landlords give more weight to applications with references.</p>
      </div>
      <div className="ref-cards">
        {REFERENCE_KINDS.map(({ key, label }) => {
          const c = cards[key];
          const id = (f) => `ref-${key}-${f}`;
          const input = (f, text, type = "text", autoComplete = "off") => (
            <div className="field">
              <label htmlFor={id(f)}>{text}</label>
              <input id={id(f)} type={type} value={c[f]} autoComplete={autoComplete} onChange={(e) => set(key, f)(e.target.value)} />
            </div>
          );
          return (
            <fieldset className="ref-card" key={key}>
              <legend>{label}</legend>
              {input("name", "Name")}
              {key === "employer" ? input("title", "Your job title") : null}
              {key === "personal" ? input("relationship", "Relationship to you") : null}
              <div className="row2">
                {input("phone", "Phone", "tel")}
                {input("email", "Email", "email")}
              </div>
              {isLandlord(key) ? (
                <>
                  <div className="field">
                    <label htmlFor={id("address")}>Rental address</label>
                    <AddressInput
                      id={id("address")}
                      fill="formatted"
                      value={c.address}
                      onChange={set(key, "address")}
                      placeholder="Address you rented"
                    />
                  </div>
                  <div className="row2">
                    {input("since", "From", "month")}
                    {input("until", "To", "month")}
                  </div>
                </>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      <div className="row">
        <button className="btn ghost sm" type="submit" disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save references"}
        </button>
        {saved && !dirty ? (
          <span className="small" role="status">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
