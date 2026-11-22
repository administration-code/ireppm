"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

// Staff: set up free phone notifications. The two keys are made here, in this browser (they never leave it until
// you paste them into Vercel). Then see whose phones are on.
export default function PushSetup() {
  const [status, setStatus] = useState(null);
  const [keys, setKeys] = useState(null);
  const [subs, setSubs] = useState([]);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch("/api/push/key").then((r) => r.json()).then(setStatus).catch(() => setStatus({ configured: false }));
    getBrowserClient()
      .from("push_subscriptions")
      .select("id, partner_id, user_agent, created_at, last_sent_at, last_error, partner:partners(name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setSubs(data || []));
  }, []);

  async function make() {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const pub = new Uint8Array([4, ...fromB64u(jwk.x), ...fromB64u(jwk.y)]);
    setKeys({ pub: b64u(pub), priv: jwk.d });
  }
  async function copy(text, k) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(k);
    setTimeout(() => setCopied(""), 2000);
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Settings</span>
        <h1 className="admin-title">Phone Notifications</h1>
        <p className="small">Free notifications on Chuck&apos;s phone (new jobs, urgent jobs, notices to serve) through the IRep app. No texting service or cost.</p>
      </div>

      <section className="boxed stack">
        <h2 className="sec-title">Status</h2>
        <p className="small">{status === null ? "Checking…" : status.configured ? "Set up. Chuck can turn notifications on from his Agent Portal." : "Not set up yet. Follow the steps below once."}</p>
      </section>

      {status && !status.configured ? (
        <section className="boxed stack">
          <h2 className="sec-title">Set Up (Once)</h2>
          <ol className="stack" style={{ gap: 8, paddingLeft: 20, margin: 0 }}>
            <li>
              <button type="button" className="btn primary sm" onClick={make}>
                Make the Two Keys
              </button>{" "}
              <span className="small">They&apos;re made in this browser and aren&apos;t saved anywhere.</span>
            </li>
            {keys ? (
              <>
                <li>
                  In Vercel → the ireppm project → Settings → Environment Variables, add <b>VAPID_PUBLIC_KEY</b> with this value (all environments):
                  <div className="req-actions">
                    <code style={{ wordBreak: "break-all" }}>{keys.pub}</code>
                    <button type="button" className="btn ghost sm" onClick={() => copy(keys.pub, "pub")}>
                      {copied === "pub" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </li>
                <li>
                  Add <b>VAPID_PRIVATE_KEY</b> with this value, and tick Sensitive:
                  <div className="req-actions">
                    <code style={{ wordBreak: "break-all" }}>{"•".repeat(20)}</code>
                    <button type="button" className="btn ghost sm" onClick={() => copy(keys.priv, "priv")}>
                      {copied === "priv" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </li>
                <li>Redeploy (Deployments → the latest → Redeploy), then refresh this page. It should say &ldquo;Set up&rdquo;.</li>
                <li className="small">Don&apos;t make new keys later: phones that turned notifications on would stop getting them.</li>
              </>
            ) : null}
          </ol>
        </section>
      ) : null}

      <section className="boxed stack">
        <h2 className="sec-title">Phones With Notifications On</h2>
        {subs.length ? (
          <ul className="plain-list">
            {subs.map((s) => (
              <li key={s.id}>
                <b>{s.partner?.name || "Staff"}</b> · {/iPhone|iPad/.test(s.user_agent || "") ? "iPhone" : /Android/.test(s.user_agent || "") ? "Android" : "Browser"} · on since{" "}
                {String(s.created_at).slice(0, 10)}
                {s.last_sent_at ? ` · last sent ${String(s.last_sent_at).slice(0, 10)}` : ""}
                {s.last_error ? <span className="small err"> · last error: {s.last_error}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">None yet.</p>
        )}
      </section>
    </div>
  );
}
