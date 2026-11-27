"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import { CERT_METHODS } from "@/lib/docusign-templates";
import { shortDate } from "@/lib/rent";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const money = (n) => `$${Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function call(method, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch("/api/agent/notices", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ error: "Something went wrong. Try again." }));
}

function Deliver({ n, onDone }) {
  const [f, setF] = useState({ served_on: today(), method: "", details: "", mail_address: "", fax_number: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save(e) {
    e.preventDefault();
    if (!f.method) return setMsg("Choose how you delivered it.");
    if (f.method === "other" && f.details.trim().length < 3) return setMsg("Type how you delivered it.");
    setBusy(true);
    setMsg("Saving and preparing your Certificate of Service…");
    const out = await call("POST", { action: "deliver", id: n.id, ...f });
    setBusy(false);
    if (out.error) return setMsg(out.error);
    onDone(
      !out.certificate
        ? "Saved. Rosie will send you the Certificate of Service to sign."
        : out.emailed
          ? "Saved. The date and how you delivered it are now filled in on the Certificate of Service in your email from DocuSign: open that email and sign."
          : "Saved. Your Certificate of Service is filled in with the date and how you delivered it: tap Sign Now under Certificates to Sign (you sign right here, no email)."
    );
  }
  return (
    <form className="stack" onSubmit={save} style={{ gap: 10 }}>
      <label className="stack" style={{ gap: 4 }}>
        <span className="small">Date you delivered it</span>
        <input type="date" max={today()} min={n.signed_on} value={f.served_on} onChange={set("served_on")} />
      </label>
      <fieldset className="stack" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
        <legend className="small">How you delivered it</legend>
        {Object.entries(CERT_METHODS).map(([k, m]) => (
          <label key={k} className="check-line">
            <input type="radio" name={`m-${n.id}`} value={k} checked={f.method === k} onChange={set("method")} />
            {m.label}
          </label>
        ))}
      </fieldset>
      {f.method === "other" ? (
        <div className="stack" style={{ gap: 4 }}>
          <input autoFocus placeholder="How did you deliver it? For example: taped it to the door" value={f.details} onChange={set("details")} />
          <span className="small">
            Taping it to the door isn&apos;t one of the ways the Landlord and Tenant Board lists. When you can, slide it under the door or through the mail slot
            instead.
          </span>
        </div>
      ) : null}
      {f.method === "mail" ? (
        <div className="stack" style={{ gap: 4 }}>
          <input placeholder={`Address you mailed it to (leave blank if it was ${n.place})`} value={f.mail_address} onChange={set("mail_address")} />
          <span className="small">Mailing adds 5 days before the notice counts as served.</span>
        </div>
      ) : null}
      {f.method === "fax" ? <input inputMode="tel" placeholder="Fax number you sent it to" value={f.fax_number} onChange={set("fax_number")} /> : null}
      <div className="req-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          Delivered
        </button>
        {msg ? <span className="small">{msg}</span> : null}
      </div>
    </form>
  );
}

// Chuck: notices the landlord has signed, to serve; tap Delivered, and the Certificate of Service comes to sign.
export default function AgentNotices() {
  const { user, ready, openSignIn } = useAuth();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState("");
  const [done, setDone] = useState("");
  const load = useCallback(async () => setD(await call("GET")), []);
  useEffect(() => {
    if (!user) return;
    (async () => {
      // Back from signing in DocuSign: update that certificate.
      const qs = new URLSearchParams(window.location.search);
      const signed = qs.get("signed");
      if (signed) {
        await call("POST", { action: "refresh", id: signed });
        setDone(qs.get("event") === "signing_complete" ? "Signed. Thanks, it's saved." : "Not signed yet. It's still below.");
        window.history.replaceState(null, "", "/agent/notices");
      }
      load();
    })();
  }, [user, load]);
  async function sign(id) {
    const out = await call("POST", { action: "sign", id });
    if (out.url) window.location.href = out.url;
    else setDone(out.error || "Couldn't open it. Try again.");
  }

  if (!ready) return <p className="small">Loading…</p>;
  if (!user)
    return (
      <div className="empty">
        <h1>Notices to Serve</h1>
        <button type="button" className="btn primary" onClick={() => openSignIn("/agent/notices")}>
          Sign in
        </button>
      </div>
    );
  if (!d) return <p className="small">Loading…</p>;
  if (!d.allowed)
    return (
      <div className="empty">
        <h1>Notices to Serve</h1>
        <p>Your account isn&apos;t set up to serve notices.</p>
      </div>
    );

  async function pdf(id) {
    const out = await call("POST", { action: "pdf", id });
    if (out.url) window.open(out.url, "_blank", "noopener");
    else setDone(out.error);
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <span className="eyebrow">
          <Link href="/agent">Agent Portal</Link>
        </span>
        <h1 className="admin-title">Notices to Serve</h1>
        <p className="small">
          When a landlord signs a notice, it shows here. Print it, deliver it, then tap I Delivered It and enter the date and how. That date and
          method go straight onto your Certificate of Service, so you don&apos;t have to look anything up.
        </p>
      </div>
      {done ? (
        <div className="okbox" role="status">
          {done}
        </div>
      ) : null}

      <section className="boxed stack" style={{ gap: 6 }}>
        <b>How to serve a notice</b>
        <span className="small">
          Hand it to the tenant, or to an adult in the unit · slide it under the door or through the mail slot · put it in their mailbox · or mail it
          (mailing adds 5 days).
        </span>
        <span className="small">
          <b>Don&apos;t tape it to the door.</b> The Landlord and Tenant Board doesn&apos;t list that as a way to serve.
        </span>
        <span className="small">To print: tap Open the Signed N4, then Share → Print, and pick your printer.</span>
      </section>

      <section className="boxed stack" style={{ gap: 6 }}>
        <b>Where you sign the Certificate of Service</b>
        <span className="small">
          <b>Most of the time: right here.</b> After I Delivered It, the certificate shows under Certificates to Sign with a <b>Sign Now</b> button. Tap it,
          check the date, and sign. No email needed.
        </span>
        <span className="small">
          <b>Older ones: in your email.</b> If a certificate says &quot;In your email&quot;, it was already emailed to you by DocuSign. Still tap I Delivered It
          here first: the date and method get filled in on it, then open the DocuSign email and sign.
        </span>
      </section>

      <section className={`boxed stack${d.toServe.length ? " attention" : ""}`} aria-labelledby="ns-serve">
        <h2 id="ns-serve" className="sec-title">
          To Deliver{d.toServe.length ? ` (${d.toServe.length})` : ""}
        </h2>
        {d.toServe.length ? (
          <ul className="req-list">
            {d.toServe.map((n) => (
              <li key={n.id} className="req stack">
                <div className="req-top">
                  <b>
                    {n.form} · {n.place}
                  </b>
                  <span className={`small${n.late ? " err" : ""}`}>{n.late ? `Late: was due ${shortDate(n.serve_by)}` : `Deliver by ${shortDate(n.serve_by)}`}</span>
                </div>
                <span className="small">
                  To {n.tenants.map((t) => t.name).join(", ") || "the tenants"}
                  {n.amount ? ` · owing ${money(n.amount)}` : ""}
                  {n.termination ? ` · ${n.form === "N1" ? "increase" : "termination"} date ${shortDate(n.termination)}` : ""}
                </span>
                <div className="req-actions">
                  {n.has_pdf ? (
                    <button type="button" className="btn ghost sm" onClick={() => pdf(n.id)}>
                      Open the Signed {n.form}
                    </button>
                  ) : null}
                  {open !== n.id ? (
                    <button type="button" className="btn primary sm" onClick={() => (setOpen(n.id), setDone(""))}>
                      I Delivered It
                    </button>
                  ) : null}
                </div>
                {open === n.id ? (
                  <Deliver
                    n={n}
                    onDone={(m) => {
                      setOpen("");
                      setDone(m);
                      load();
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">Nothing to deliver right now.</p>
        )}
      </section>

      {d.toSign.length ? (
        <section className="boxed stack attention" aria-labelledby="ns-sign">
          <h2 id="ns-sign" className="sec-title">
            Certificates to Sign ({d.toSign.length})
          </h2>
          <p className="small">The date and how you delivered it are already filled in. Tap Sign Now to sign here, or for ones marked &quot;In your email&quot;, open the DocuSign email and sign there.</p>
          <ul className="req-list">
            {d.toSign.map((c) => (
              <li key={c.id} className="req">
                <div className="req-top">
                  <b>{c.title}</b>
                  <span className="small">sent {shortDate(c.sent_on)}</span>
                </div>
                {c.embedded ? (
                  <div className="req-actions">
                    <button type="button" className="btn primary sm" onClick={() => sign(c.id)}>
                      Sign Now
                    </button>
                  </div>
                ) : (
                  <span className="small">
                    In your email ({c.email}) from DocuSign: open it and sign.{c.served_on ? ` The date (${shortDate(c.served_on)}) is filled in.` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
