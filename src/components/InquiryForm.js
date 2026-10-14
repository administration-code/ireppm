"use client";

import { useState } from "react";
import { getBrowserClient, supabaseConfigured } from "@/lib/supabase";
import { INQUIRY_INTERESTS, SITE } from "@/lib/site";

export default function InquiryForm() {
  const [f, setF] = useState({ name: "", phone: "", email: "", property_address: "", interest: INQUIRY_INTERESTS[0], message: "" });
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
    const payload = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]));
    const { error: err } = await sb.from("landlord_inquiries").insert(payload);
    if (err) {
      setState("idle");
      setError(`We couldn't send that. Try again, or email us at ${SITE.email}.`);
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return <div className="okbox">Thanks, {f.name.split(" ")[0] || "we've got it"}. We'll reply within one business day.</div>;
  }

  return (
    <form id="inquiry" className="stack" style={{ gap: 12 }} onSubmit={submit}>
      <span className="eyebrow">Landlord inquiry</span>
      <div className="row2">
        <div className="field">
          <label htmlFor="i-name">Name</label>
          <input id="i-name" value={f.name} onChange={set("name")} autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="i-phone">Phone</label>
          <input id="i-phone" type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="i-email">Email</label>
        <input id="i-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="i-addr">Property address</label>
        <input id="i-addr" value={f.property_address} onChange={set("property_address")} placeholder="Street, Windsor" />
      </div>
      <div className="field">
        <label htmlFor="i-int">Interested in</label>
        <select id="i-int" value={f.interest} onChange={set("interest")}>
          {INQUIRY_INTERESTS.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="i-msg">Tell us about the property (optional)</label>
        <textarea id="i-msg" value={f.message} onChange={set("message")} placeholder="Number of units, current tenants, when you need help" />
      </div>
      {error ? <p className="err">{error}</p> : null}
      <button className="btn primary" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send inquiry"}
      </button>
    </form>
  );
}
