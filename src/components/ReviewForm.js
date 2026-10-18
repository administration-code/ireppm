"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";

export default function ReviewForm({ initialType = "" }) {
  const auth = useAuth();
  const [f, setF] = useState({ reviewer_type: initialType, rating: 0, display_name: "", title: "", body: "", email: "", consent: false, website: "" });
  const [state, setState] = useState("");
  const [error, setError] = useState("");
  const [roles, setRoles] = useState(null);

  useEffect(() => {
    if (!auth?.ready) return;
    let alive = true;
    (async () => {
      const { data } = await getBrowserClient().auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return alive && setRoles({ signedIn: false });
      const res = await fetch("/api/reviews", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!alive) return;
      setRoles(json);
      const only = json.tenant && !json.landlord ? "tenant" : json.landlord && !json.tenant ? "landlord" : "";
      if (only) setF((x) => ({ ...x, reviewer_type: only }));
    })();
    return () => {
      alive = false;
    };
  }, [auth?.ready, auth?.user?.id]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    setState("sending");
    try {
      const { data } = await getBrowserClient().auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(f),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Your review didn't send. Try again.");
      setState("sent");
    } catch (err) {
      setError(err.message);
      setState("");
    }
  }

  if (state === "sent")
    return <div className="okbox" role="status">Thank you for your review. We&apos;ll post it on this page once we&apos;ve checked it, usually within a couple of days.</div>;

  if (!roles) return <p className="small">Loading…</p>;
  if (!roles.signedIn)
    return (
      <div className="stack" style={{ gap: 10 }}>
        <p style={{ margin: 0 }}>Reviews are for tenants and landlords who&apos;ve rented or managed a property with us. Sign in with your IRep account to write one.</p>
        <button type="button" className="btn primary" style={{ justifySelf: "start" }} onClick={() => auth?.openSignIn?.("/reviews#write")}>
          Sign in to write a review
        </button>
      </div>
    );
  if (!roles.tenant && !roles.landlord)
    return (
      <p style={{ margin: 0 }}>
        Your account isn&apos;t linked to a property with IRep yet, so it can&apos;t leave a review. If you rent from us or we manage your property, contact us and we&apos;ll link it.
      </p>
    );

  const types = [["tenant", "Tenant"], ["landlord", "Landlord"]].filter(([v]) => roles[v]);

  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>I&apos;m a</legend>
        <div className="row" style={{ gap: 16 }}>
          {types.map(([v, l]) => (
            <label key={v} className="check">
              <input type="radio" name="reviewer_type" value={v} checked={f.reviewer_type === v} onChange={set("reviewer_type")} required />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Your rating</legend>
        <div className="stars-input" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={n <= f.rating ? "on" : ""}>
              <input className="visually-hidden" type="radio" name="rating" value={n} checked={f.rating === n} onChange={() => setF((x) => ({ ...x, rating: n }))} required />
              <span aria-hidden="true">★</span>
              <span className="visually-hidden">{n} star{n === 1 ? "" : "s"}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="row2">
        <div className="field">
          <label htmlFor="rv-name">Name to show</label>
          <input id="rv-name" value={f.display_name} onChange={set("display_name")} maxLength={60} placeholder="For example, Priya S." required />
        </div>
        <div className="field">
          <label htmlFor="rv-email">Email (not shown)</label>
          <input id="rv-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" placeholder={auth?.user?.email || ""} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="rv-title">Headline (optional)</label>
        <input id="rv-title" value={f.title} onChange={set("title")} maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="rv-body">Your review</label>
        <textarea id="rv-body" value={f.body} onChange={set("body")} maxLength={2000} rows={5} required placeholder="What was it like renting or working with IRep?" />
      </div>
      <input type="text" name="website" value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px" }} />
      <label className="check" style={{ alignItems: "flex-start" }}>
        <input type="checkbox" checked={f.consent} onChange={set("consent")} required />
        <span>IRep can publish my review and the name above on its website.</span>
      </label>
      {error ? <p className="err">{error}</p> : null}
      <button className="btn primary" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send my review"}
      </button>
    </form>
  );
}
