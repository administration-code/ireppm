"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { uploadPhotos } from "@/components/admin/PhotoPicker";
import { PHOTO_ACCEPT } from "@/lib/maintenance";
import { shortDate } from "@/lib/rent";

const KIND = { lawn: "🌱 Lawn", snow: "❄️ Snow" };

async function call(method, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch("/api/agent/visits", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ error: "Something went wrong. Try again." }));
}

// Chuck: log a lawn or snow visit in three taps, with a photo as proof.
export default function AgentVisits() {
  const { user, ready } = useAuth();
  const [d, setD] = useState(null);
  const [propertyId, setPropertyId] = useState("");
  const [kind, setKind] = useState("");
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const load = useCallback(async () => setD(await call("GET")), []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function save() {
    if (!propertyId) return setMsg({ kind: "err", text: "Tap the property." });
    if (!kind) return setMsg({ kind: "err", text: "Tap Lawn or Snow." });
    setMsg({ kind: "", text: "" });
    let photos = [];
    if (files.length) {
      setBusy(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}…`);
      const out = await uploadPhotos(getBrowserClient(), user.id, files);
      if (out.error) {
        setBusy("");
        return setMsg({ kind: "err", text: out.error });
      }
      photos = out.photos;
    }
    setBusy("Saving…");
    const out = await call("POST", { property_id: propertyId, kind, photos, note });
    setBusy("");
    if (out.error) return setMsg({ kind: "err", text: out.error });
    const address = d.properties.find((p) => p.id === propertyId)?.address;
    setMsg({ kind: "ok", text: `✓ ${KIND[kind].slice(3)} visit logged at ${address}.` });
    setPropertyId("");
    setFiles([]);
    setNote("");
    load();
  }

  if (!ready || (user && !d)) return <p className="small">Loading…</p>;
  if (!user) return <p>Sign in to your Agent Portal first.</p>;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <Link href="/agent" className="small">
          ← Agent Portal
        </Link>
        <h1 className="admin-title">Lawn and Snow</h1>
        <p className="small" style={{ margin: 0 }}>
          Log each visit right after you finish. A photo is your proof if anyone says it wasn&apos;t done.
        </p>
      </div>

      <section className="boxed stack">
        <h2 className="sec-title">1. What Did You Do?</h2>
        <div className="req-actions">
          {Object.entries(KIND).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              className={`btn ${kind === k ? "primary" : "ghost"}`}
              style={{ minHeight: 56, minWidth: 130, fontSize: "1.1rem" }}
              onClick={() => setKind(kind === k ? "" : k)}
            >
              {kind === k ? "✓ " : ""}
              {label}
            </button>
          ))}
        </div>

        <h2 className="sec-title">2. Where?</h2>
        <div role="group" aria-label="Property" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {d.properties.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={propertyId === p.id}
              className={`btn ${propertyId === p.id ? "primary" : "ghost"} sm`}
              style={{ minHeight: 48, textAlign: "left", whiteSpace: "normal" }}
              onClick={() => setPropertyId(propertyId === p.id ? "" : p.id)}
            >
              {propertyId === p.id ? "✓ " : ""}
              {p.address}
            </button>
          ))}
        </div>

        <h2 className="sec-title">3. Photo (Recommended)</h2>
        <label className="btn ghost" style={{ minHeight: 48, width: "fit-content", display: "inline-flex", alignItems: "center" }}>
          📷 {files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} added` : "Take or Add a Photo"}
          <input type="file" accept={PHOTO_ACCEPT} multiple hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])].slice(0, 6))} />
        </label>
        <input aria-label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): salted the steps too" />

        {msg.text ? (
          <div className={msg.kind === "err" ? "warnbox" : "okbox"} role={msg.kind === "err" ? "alert" : "status"}>
            {msg.text}
          </div>
        ) : null}
        <button type="button" className="btn primary" style={{ minHeight: 52, fontSize: "1.05rem" }} disabled={Boolean(busy)} onClick={save}>
          {busy || "Log Visit"}
        </button>
      </section>

      <section className="boxed stack">
        <h2 className="sec-title">Last 30 Days</h2>
        {!d.ready ? (
          <p className="small">Logging visits isn&apos;t switched on yet.</p>
        ) : !d.visits.length ? (
          <p className="small">No visits logged yet.</p>
        ) : (
          <ul className="plain-list stack" style={{ gap: 8 }}>
            {d.visits.map((v) => (
              <li key={v.id}>
                <b>{shortDate(v.visited_on)}</b> · {KIND[v.kind]} · {v.address}
                {v.photos ? ` · 📷 ${v.photos}` : " · no photo"}
                {v.note ? <span className="small sub-line">{v.note}</span> : null}
                {v.visited_on === today ? (
                  <button type="button" className="link-btn small" onClick={async () => (await call("POST", { action: "delete", id: v.id }), load())}>
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
