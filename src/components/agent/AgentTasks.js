"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { shortDate } from "@/lib/rent";

async function call(method, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch("/api/agent/tasks", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  return res ? res.json().catch(() => ({ error: "Something went wrong. Try again." })) : { error: "No connection. Try again." };
}

const telHref = (p) => `tel:${String(p).replace(/[^\d+]/g, "")}`;

// Chuck: tasks the office handed him (e.g. talk to tenants about signing their lease).
// Each shows where, who to talk to (tap to call), and a Done button with an optional note.
export default function AgentTasks() {
  const { user, ready } = useAuth();
  const [tasks, setTasks] = useState(null);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: false, text: "" });

  const load = useCallback(async () => {
    const out = await call("GET");
    setTasks(out.tasks || []);
  }, []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function done(id) {
    setBusy(true);
    const out = await call("POST", { id, note });
    setBusy(false);
    if (out.error) return setMsg({ ok: false, text: out.error });
    setMsg({ ok: true, text: "Done. The office has been told." });
    setOpen(null);
    setNote("");
    load();
  }

  if (ready && !user) return <p>Please sign in.</p>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link className="back" href="/agent">
        ← Agent Portal
      </Link>
      <h1 className="admin-title">Tasks From the Office</h1>
      {msg.text ? (
        <div className={msg.ok ? "okbox" : "warnbox"} role="status">
          {msg.text}
        </div>
      ) : null}
      {tasks === null ? (
        <p className="small">Loading…</p>
      ) : !tasks.length ? (
        <p>Nothing to do right now. New tasks show up here, and you&apos;ll get a notification.</p>
      ) : (
        tasks.map((t) => (
          <div key={t.id} className="boxed stack" style={{ gap: 8 }}>
            <div>
              <b style={{ fontSize: "1.1rem" }}>{t.title}</b>
              <p className="small" style={{ margin: "2px 0 0" }}>
                {[t.place, t.due_date ? `by ${shortDate(t.due_date)}` : ""].filter(Boolean).join(" · ")}
              </p>
            </div>
            {t.detail ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{t.detail}</p> : null}
            {t.people.length ? (
              <div className="stack" style={{ gap: 6 }}>
                {t.people.map((p, i) => (
                  <div key={i} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span>{p.name}</span>
                    {p.phone ? (
                      <a className="btn ghost sm" href={telHref(p.phone)}>
                        Call {p.phone}
                      </a>
                    ) : (
                      <span className="small">no phone on file</span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            {open === t.id ? (
              <div className="stack" style={{ gap: 8 }}>
                <label className="small" htmlFor={`note-${t.id}`}>
                  Anything the office should know? (optional)
                </label>
                <textarea id={`note-${t.id}`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
                <div className="req-actions">
                  <button type="button" className="btn primary" disabled={busy} onClick={() => done(t.id)}>
                    {busy ? "Saving…" : "Mark Done"}
                  </button>
                  <button type="button" className="link-btn small" onClick={() => setOpen(null)}>
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="req-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    setMsg({ ok: false, text: "" });
                    setNote("");
                    setOpen(t.id);
                  }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
