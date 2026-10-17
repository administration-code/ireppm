"use client";

import { useState } from "react";
import { getBrowserClient, supabaseConfigured } from "@/lib/supabase";
import { INQUIRY_INTERESTS, SITE } from "@/lib/site";
import AddressInput from "@/components/AddressInput";

// estimate: the free rent estimate version (asks about the home instead of the package).
export default function InquiryForm({ estimate = false, id = "inquiry" }) {
  const [f, setF] = useState({
    name: "", phone: "", email: "", property_address: "",
    interest: estimate ? "Free rent estimate" : INQUIRY_INTERESTS[1], message: "",
    home_type: "House", beds: "", baths: "",
  });
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!supabaseConfigured) {
      setError(`Online inquiries aren't switched on yet. Email us at ${SITE.email} instead.`);
      return;
    }
    setState("sending");
    const sb = getBrowserClient();
    const { home_type, beds, baths, ...rest } = f;
    const about = estimate ? [`Home: ${home_type}`, beds && `${beds} bed`, baths && `${baths} bath`].filter(Boolean).join(", ") : "";
    const payload = Object.fromEntries(
      Object.entries({ ...rest, message: [about, rest.message.trim()].filter(Boolean).join("\n") }).map(([k, v]) => [k, String(v || "").trim() || null])
    );
    const { error: err } = await sb.from("landlord_inquiries").insert(payload);
    if (err) {
      setState("idle");
      setError(`We couldn't send that. Try again, or email us at ${SITE.email}.`);
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="okbox">
        Thanks, {f.name.split(" ")[0] || "we've got it"}. We&apos;ll reply within one business day
        {estimate ? " with a rent estimate for your property." : "."}
      </div>
    );
  }

  return (
    <form id={id} className="stack" style={{ gap: 12 }} onSubmit={submit}>
      <span className="eyebrow">{estimate ? "Free rent estimate" : "Landlord inquiry"}</span>
      <div className="row2">
        <div className="field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} value={f.name} onChange={set("name")} autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor={`${id}-phone`}>Phone</label>
          <input id={`${id}-phone`} type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-email`}>Email</label>
        <input id={`${id}-email`} type="email" value={f.email} onChange={set("email")} autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor={`${id}-addr`}>Property address</label>
        <AddressInput
          id={`${id}-addr`}
          fill="formatted"
          value={f.property_address}
          onChange={(v) => setF((x) => ({ ...x, property_address: v }))}
          placeholder="Street, Windsor"
        />
      </div>
      {estimate ? (
        <div className="row3">
          <div className="field">
            <label htmlFor={`${id}-type`}>Type of home</label>
            <select id={`${id}-type`} value={f.home_type} onChange={set("home_type")}>
              {["House", "Semi or townhouse", "Duplex / triplex", "Apartment or condo", "Rooming house", "Other"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-beds`}>Bedrooms</label>
            <input id={`${id}-beds`} inputMode="numeric" value={f.beds} onChange={set("beds")} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-baths`}>Bathrooms</label>
            <input id={`${id}-baths`} inputMode="decimal" value={f.baths} onChange={set("baths")} />
          </div>
        </div>
      ) : (
      <div className="field">
        <label htmlFor={`${id}-int`}>Interested in</label>
        <select id={`${id}-int`} value={f.interest} onChange={set("interest")}>
          {INQUIRY_INTERESTS.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      )}
      <div className="field">
        <label htmlFor={`${id}-msg`}>Tell us about the property (optional)</label>
        <textarea id={`${id}-msg`} value={f.message} onChange={set("message")} placeholder="Number of units, current tenants, when you need help" />
      </div>
      {error ? <p className="err">{error}</p> : null}
      <button className="btn primary" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : estimate ? "Get my rent estimate" : "Send inquiry"}
      </button>
    </form>
  );
}
