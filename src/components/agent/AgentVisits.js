"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { uploadPhotos } from "@/components/admin/PhotoPicker";
import { PHOTO_ACCEPT } from "@/lib/maintenance";
import { shortDate } from "@/lib/rent";
import { money } from "@/lib/format";

const KIND = { lawn: "Lawn", snow: "Snow" };

async function call(method, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch("/api/agent/visits", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ error: "Something went wrong. Try again." }));
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const lastText = (l) => (l ? `${shortDate(l.on)}${l.on === today() ? " (today)" : ""}${l.photos ? "" : " · no photo"}` : "Never");

// Chuck: lawn and snow, by contract. Included properties first, then the ones billed per visit.
// Each property shows its last lawn and snow visit; Log Lawn / Log Snow opens a photo + Save right there.
export default function AgentVisits() {
  const { user, ready } = useAuth();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null); // { id, kind }
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "", id: null });

  const load = useCallback(async () => setD(await call("GET")), []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  function start(p, kind) {
    setOpen(open?.id === p.id && open?.kind === kind ? null : { id: p.id, kind });
    setFiles([]);
    setNote("");
    setMsg({ kind: "", text: "", id: null });
  }

  async function save(p) {
    let photos = [];
    if (files.length) {
      setBusy(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}…`);
      const out = await uploadPhotos(getBrowserClient(), user.id, files);
      if (out.error) {
        setBusy("");
        return setMsg({ kind: "err", text: out.error, id: p.id });
      }
      photos = out.photos;
    }
    setBusy("Saving…");
    const out = await call("POST", { property_id: p.id, kind: open.kind, photos, note });
    setBusy("");
    if (out.error) return setMsg({ kind: "err", text: out.error, id: p.id });
    setMsg({ kind: "ok", text: `✓ ${KIND[open.kind]} visit logged.`, id: p.id });
    setOpen(null);
    setFiles([]);
    setNote("");
    load();
  }

  async function remove(p, v) {
    await call("POST", { action: "delete", id: v.id });
    setMsg({ kind: "ok", text: "Removed.", id: p.id });
    load();
  }

  if (!ready || (user && !d)) return <p className="small">Loading…</p>;
  if (!user) return <p>Sign in to your Agent Portal first.</p>;

  const row = (p) => {
    const isOpen = open?.id === p.id;
    const todays = p.recent.filter((v) => v.on === today());
    return (
      <li key={p.id} className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <div>
          <b>{p.address}</b>
          <span className="small sub-line">
            {p.fee.amount != null ? `${money(p.fee.amount)} ${p.fee.per === "month" ? "a month" : "per visit"} · ` : ""}
            {p.fee.label}
          </span>
        </div>
        <div className="small" style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 10, rowGap: 2 }}>
          <span>Last lawn:</span>
          <b>{lastText(p.lastLawn)}</b>
          <span>Last snow:</span>
          <b>{lastText(p.lastSnow)}</b>
        </div>
        <div className="req-actions">
          {Object.entries(KIND).map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={isOpen && open.kind === k}
              className={`btn ${isOpen && open.kind === k ? "primary" : "ghost"}`}
              style={{ minHeight: 48, minWidth: 120 }}
              onClick={() => start(p, k)}
            >
              Log {l}
            </button>
          ))}
        </div>
        {isOpen ? (
          <div className="stack" style={{ gap: 8, background: "var(--ivory, #F7F4EE)", borderRadius: 8, padding: 12 }}>
            <span className="small">
              {KIND[open.kind]} visit today{p.included ? " (included in their plan)" : ` (${money(p.fee.amount)}, billed to the landlord)`}
            </span>
            <label className="btn ghost" style={{ minHeight: 48, width: "fit-content", display: "inline-flex", alignItems: "center", background: "#fff" }}>
              {files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} added` : "Take or Add a Photo"}
              <input type="file" accept={PHOTO_ACCEPT} multiple hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])].slice(0, 6))} />
            </label>
            <input aria-label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): salted the steps too" />
            <button type="button" className="btn primary" style={{ minHeight: 52 }} disabled={Boolean(busy)} onClick={() => save(p)}>
              {busy || (files.length ? "Save Visit" : "Save Without a Photo")}
            </button>
          </div>
        ) : null}
        {msg.id === p.id && msg.text ? (
          <span className={`small${msg.kind === "err" ? " err" : ""}`} role={msg.kind === "err" ? "alert" : "status"}>
            {msg.text}
          </span>
        ) : null}
        {todays.length ? (
          <span className="small">
            Logged today: {todays.map((v) => KIND[v.kind]).join(", ")}.{" "}
            <button type="button" className="link-btn small" onClick={() => remove(p, todays[0])}>
              Remove the last one
            </button>
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <Link href="/agent" className="small">
          ← Agent Portal
        </Link>
        <h1 className="admin-title">Lawn and Snow</h1>
        <p className="small" style={{ margin: 0 }}>
          Log each visit right after you finish. Add a photo: it&apos;s your proof if anyone says it wasn&apos;t done.
        </p>
      </div>
      {d.ready === false ? <div className="warnbox">Logging visits isn&apos;t switched on yet. Tell Rosie.</div> : null}

      <section className="boxed stack" aria-labelledby="ls-inc">
        <h2 id="ls-inc" className="sec-title">
          Included in Their Plan ({d.included.length})
        </h2>
        <p className="small" style={{ margin: 0 }}>
          These landlords pay for lawn and snow every month. Keep them up all season.
        </p>
        {d.included.length ? <ul className="plain-list stack" style={{ gap: 12 }}>{d.included.map(row)}</ul> : <p className="small">None yet.</p>}
      </section>

      <section className="boxed stack" aria-labelledby="ls-alc">
        <h2 id="ls-alc" className="sec-title">
          Not on a Plan: Per Visit ({d.alaCarte.length})
        </h2>
        <p className="small" style={{ margin: 0 }}>
          Only when IRep or the landlord asks. Each visit is billed to the landlord at {money(d.rates.visit)}.
        </p>
        {d.alaCarte.length ? <ul className="plain-list stack" style={{ gap: 12 }}>{d.alaCarte.map(row)}</ul> : <p className="small">None.</p>}
      </section>
    </div>
  );
}
