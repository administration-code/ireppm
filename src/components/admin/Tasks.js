"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate, todayISO } from "@/lib/rent";
import { refreshStaffCounts } from "@/lib/admin-nav";

const KIND = {
  needs_setup: "Needs setup",
  lmr_topup: "LMR top-up",
  amendment: "Amendment",
  follow_up: "Follow-up",
  draft_email: "Email draft",
  ai: "From the assistant",
  other: "Task",
};
const daysSince = (d) => (d ? Math.max(0, Math.round((Date.parse(todayISO()) - Date.parse(String(d).slice(0, 10))) / 86400000)) : null);

// Staff: one list of things to do, and things waiting on someone else (who, since when).
export default function Tasks() {
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("open");
  const [f, setF] = useState({ title: "", waiting_on: "", due_date: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const statuses = tab === "open" ? ["open", "waiting"] : ["done", "dismissed"];
    const { data } = await getBrowserClient()
      .from("staff_tasks")
      .select("*")
      .in("status", statuses)
      .order(tab === "open" ? "created_at" : "done_at", { ascending: false })
      .limit(200);
    setRows(data || []);
  }, [tab]);
  useEffect(() => {
    load();
  }, [load]);

  async function update(id, changes) {
    const { data: u } = await getBrowserClient().auth.getUser();
    const done = ["done", "dismissed"].includes(changes.status);
    await getBrowserClient()
      .from("staff_tasks")
      .update({ ...changes, ...(done ? { done_at: new Date().toISOString(), done_by: u?.user?.id || null } : {}) })
      .eq("id", id);
    refreshStaffCounts();
    load();
  }

  async function add(e) {
    e.preventDefault();
    if (!f.title.trim()) return setMsg("What needs doing?");
    const { error } = await getBrowserClient()
      .from("staff_tasks")
      .insert({
        title: f.title.trim(),
        status: f.waiting_on.trim() ? "waiting" : "open",
        waiting_on: f.waiting_on.trim() || null,
        waiting_since: f.waiting_on.trim() ? todayISO() : null,
        due_date: f.due_date || null,
        kind: f.waiting_on.trim() ? "follow_up" : "other",
      });
    if (error) return setMsg(error.message);
    setF({ title: "", waiting_on: "", due_date: "" });
    setMsg("");
    refreshStaffCounts();
    load();
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff</span>
        <h1 className="admin-title">Tasks</h1>
        <p className="small">Things to do and things waiting on someone else. The website adds some (a lease that needs setting up, an LMR top-up); add your own below.</p>
      </div>
      <form className="row4" onSubmit={add} noValidate style={{ alignItems: "end" }}>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label htmlFor="tk-title">New task</label>
          <input id="tk-title" value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} placeholder="Follow up with Keyur about the Upper lease" />
        </div>
        <div className="field">
          <label htmlFor="tk-wait">Waiting on (optional)</label>
          <input id="tk-wait" value={f.waiting_on} onChange={(e) => setF((s) => ({ ...s, waiting_on: e.target.value }))} placeholder="Landlord, Chuck…" />
        </div>
        <div className="field">
          <label htmlFor="tk-due">Due (optional)</label>
          <input id="tk-due" type="date" value={f.due_date} onChange={(e) => setF((s) => ({ ...s, due_date: e.target.value }))} />
        </div>
        <div>
          <button type="submit" className="btn primary sm">
            Add Task
          </button>
        </div>
      </form>
      {msg ? <div className="warnbox">{msg}</div> : null}
      <div className="seg">
        <button type="button" aria-pressed={tab === "open"} onClick={() => setTab("open")}>
          Open
        </button>
        <button type="button" aria-pressed={tab === "done"} onClick={() => setTab("done")}>
          Done
        </button>
      </div>
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !rows.length ? (
        <p className="small">Nothing here.</p>
      ) : (
        <ul className="req-list">
          {rows.map((t) => (
            <li key={t.id} className="req">
              <div className="req-top">
                <b>{t.title}</b>
                <span className="small">
                  {KIND[t.kind] || "Task"} · added {shortDate(String(t.created_at).slice(0, 10))}
                  {t.due_date ? ` · due ${shortDate(t.due_date)}` : ""}
                </span>
              </div>
              {t.detail ? <p className="small" style={{ margin: "4px 0" }}>{t.detail}</p> : null}
              {t.status === "waiting" ? (
                <p className="small" style={{ margin: "4px 0" }}>
                  Waiting on <b>{t.waiting_on}</b> since {shortDate(t.waiting_since)} ({daysSince(t.waiting_since)} days)
                </p>
              ) : null}
              {t.data?.body ? (
                <details className="small">
                  <summary>Email draft</summary>
                  <p style={{ whiteSpace: "pre-wrap" }}>{t.data.body}</p>
                </details>
              ) : null}
              {tab === "open" ? (
                <div className="req-actions">
                  {t.data?.body || t.data?.template ? (
                    <Link className="btn ghost sm" href={`/admin/emails/new?task=${t.id}`}>
                      Create Draft
                    </Link>
                  ) : null}
                  {t.link ? (
                    <Link className="btn ghost sm" href={t.link}>
                      Open
                    </Link>
                  ) : null}
                  <button type="button" className="btn primary sm" onClick={() => update(t.id, { status: "done" })}>
                    Done
                  </button>
                  {t.status === "open" ? (
                    <button
                      type="button"
                      className="link-btn small"
                      onClick={() => {
                        const who = window.prompt("Waiting on whom?");
                        if (who) update(t.id, { status: "waiting", waiting_on: who, waiting_since: todayISO() });
                      }}
                    >
                      Waiting on…
                    </button>
                  ) : (
                    <button type="button" className="link-btn small" onClick={() => update(t.id, { status: "open", waiting_on: null, waiting_since: null })}>
                      Not waiting
                    </button>
                  )}
                  <button type="button" className="link-btn small" onClick={() => update(t.id, { status: "dismissed" })}>
                    Dismiss
                  </button>
                </div>
              ) : (
                <span className="small">{t.status === "done" ? "Done" : "Dismissed"} {t.done_at ? shortDate(String(t.done_at).slice(0, 10)) : ""}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
