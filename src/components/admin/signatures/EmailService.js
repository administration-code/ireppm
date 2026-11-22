"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { refreshStaffCounts } from "@/lib/admin-nav";
import { shortDate } from "@/lib/rent";

async function api(method, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch("/api/admin/serving", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ error: "Something went wrong. Try again." }));
}

// Staff (Rishi): notices to serve by email to tenants who consented in writing, and Certificates of Service to sign,
// all on one page. Sending one makes you the person who served it, so you sign its certificate here.
export default function EmailService() {
  const [d, setD] = useState(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState({ text: "", tone: "" });
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => setD(await api("GET")), []);

  useEffect(() => {
    (async () => {
      const sb = getBrowserClient();
      const { data: u } = await sb.auth.getUser();
      const { data: p } = u?.user ? await sb.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle() : { data: null };
      const n = String(p?.full_name || "").trim();
      if (n && !/^administration$/i.test(n)) setName(n);
      // Back from signing in DocuSign: update that certificate's status.
      const signed = new URLSearchParams(window.location.search).get("signed");
      const evt = new URLSearchParams(window.location.search).get("event");
      if (signed) {
        await api("POST", { action: "refresh", id: signed });
        setMsg(evt === "signing_complete" ? { text: "Signed. The certificate is saved with the notice.", tone: "ok" } : { text: "Not signed yet. It's still below.", tone: "" });
        window.history.replaceState(null, "", "/admin/serving");
      }
      load();
      refreshStaffCounts();
    })();
  }, [load]);

  async function send(n) {
    if (name.trim().split(/\s+/).length < 2) return setMsg({ text: "Type your full name first: you sign the Certificate of Service.", tone: "err" });
    if (!window.confirm(`Email the ${n.form} to ${n.emails.join(", ")} now? This serves it on the tenants today.`)) return;
    setBusy(n.id);
    const out = await api("POST", { action: "send", id: n.id, signer_name: name.trim() });
    setBusy("");
    if (out.error) return setMsg({ text: out.error, tone: "err" });
    setMsg({ text: `Served by email to ${out.sent_to.join(", ")}. ${out.certificate ? "Sign the certificate below." : "The certificate couldn't be made: send it from the notice page."}`, tone: "ok" });
    load();
    refreshStaffCounts();
  }
  async function sign(c) {
    setBusy(c.id);
    const out = await api("POST", { action: "sign", id: c.id });
    setBusy("");
    if (out.error) return setMsg({ text: out.error, tone: "err" });
    window.location.href = out.url;
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Signatures</span>
        <h1 className="admin-title">Email Service</h1>
        <p className="small">
          Signed N4, N5 and N1 notices for tenants who consented in writing to email service (and have an email for every tenant). Send it here, then sign
          the Certificate of Service right on this page. Everyone else is served on paper by Chuck.
        </p>
      </div>
      {msg.text ? (
        <div className={msg.tone === "ok" ? "okbox" : msg.tone === "err" ? "warnbox" : "small"} role="status">
          {msg.text}
        </div>
      ) : null}
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="es-name">Your full name (you sign the certificates)</label>
        <input id="es-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" />
      </div>

      {!d ? (
        <p className="small">Loading…</p>
      ) : d.error ? (
        <p className="small">{d.error}</p>
      ) : (
        <>
          <section className={`boxed stack${d.toSend.length ? " attention" : ""}`}>
            <h2 className="sec-title">To Send{d.toSend.length ? ` (${d.toSend.length})` : ""}</h2>
            {d.toSend.length ? (
              <ul className="req-list">
                {d.toSend.map((n) => (
                  <li key={n.id} className="req stack">
                    <div className="req-top">
                      <Link href={`/admin/signatures/${n.id}`}>
                        <b>{n.title}</b>
                      </Link>
                      <span className="small">signed by the landlord {shortDate(n.signed_on)}</span>
                    </div>
                    <span className="small">
                      To {n.emails.join(", ")}
                      {n.termination ? ` · ${n.form === "N1" ? "increase" : "termination"} date ${shortDate(n.termination)}` : ""}
                    </span>
                    <div className="req-actions">
                      <button type="button" className="btn primary sm" disabled={!!busy} onClick={() => send(n)}>
                        {busy === n.id ? "Sending…" : "Email It to the Tenants"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small">Nothing to send.</p>
            )}
          </section>

          <section className={`boxed stack${d.toSign.length ? " attention" : ""}`}>
            <h2 className="sec-title">Certificates to Sign{d.toSign.length ? ` (${d.toSign.length})` : ""}</h2>
            {d.toSign.length ? (
              <ul className="req-list">
                {d.toSign.map((c) => (
                  <li key={c.id} className="req">
                    <div className="req-top">
                      <b>{c.title}</b>
                      <span className="small">served {c.served_on ? shortDate(c.served_on) : ""}</span>
                    </div>
                    <div className="req-actions">
                      {c.embedded ? (
                        <button type="button" className="btn primary sm" disabled={!!busy} onClick={() => sign(c)}>
                          {busy === c.id ? "Opening…" : "Review and Sign"}
                        </button>
                      ) : (
                        <span className="small">Sent to you by DocuSign email: sign it there.</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small">Nothing to sign.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
