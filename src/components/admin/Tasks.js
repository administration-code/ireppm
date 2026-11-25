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
  dispute: "PM contract dispute",
  other: "Task",
};
const daysSince = (d) => (d ? Math.max(0, Math.round((Date.parse(todayISO()) - Date.parse(String(d).slice(0, 10))) / 86400000)) : null);

// Staff: one list of things to do, and things waiting on someone else (who, since when).
export default function Tasks() {
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("open");
  const [f, setF] = useState({ title: "", detail: "", waiting_on: "", due_date: "", kind: "other", assigned_to: "" });
  const [partners, setPartners] = useState([]);
  const [msg, setMsg] = useState("");
  const [staff, setStaff] = useState([]);
  const [me, setMe] = useState(null);
  const [who, setWho] = useState(null); // "mine" | "all" | "unassigned"
  useEffect(() => {
    (async () => {
      const sb = getBrowserClient();
      const [{ data: u }, { data: list }, { data: field }] = await Promise.all([
        sb.auth.getUser(),
        sb.rpc("staff_members"),
        sb.from("property_agents").select("partner:partners(id, name, active, email)"),
      ]);
      // Partners who sign in to the agent portal (Chuck), so tasks can go to them too.
      setPartners([...new Map((field || []).map((r) => r.partner).filter((p) => p?.active && p.email).map((p) => [p.id, p])).values()]);
      const mine = (list || []).find((p) => p.id === u?.user?.id) || null;
      setStaff(list || []);
      setMe(mine);
      setWho((w) => w || (mine?.role === "admin" ? "all" : "mine"));
    })();
  }, []);
  const partnerName = (id) => partners.find((p) => p.id === id)?.name || "Chuck";
  const nameOf = (id) => {
    const p = staff.find((x) => x.id === id);
    return p ? p.full_name || p.email : "";
  };
  async function assign(id, to) {
    const { data } = await getBrowserClient().auth.getSession();
    const res = await fetch(`/api/admin/tasks/${id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
      body: JSON.stringify(String(to || "").startsWith("partner:") ? { partner_id: to.slice(8) } : { assigned_to: to || null, clear_partner: true }),
    });
    if (!res.ok) setMsg((await res.json().catch(() => ({}))).error || "Couldn't assign that task.");
    refreshStaffCounts();
    load();
  }

  const load = useCallback(async () => {
    if (!who) return;
    const statuses = tab === "open" ? ["open", "waiting"] : ["done", "dismissed"];
    let q = getBrowserClient().from("staff_tasks").select("*").in("status", statuses);
    if (who === "mine" && me) q = q.eq("assigned_to", me.id);
    if (who === "unassigned") q = q.is("assigned_to", null);
    if (who === "partner") q = q.not("partner_id", "is", null);
    const { data } = await q.order(tab === "open" ? "created_at" : "done_at", { ascending: false }).limit(200);
    setRows(data || []);
  }, [tab, who, me]);
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
    // PM contract disputes go to the admin (Rosie) first to sort, unless someone is chosen.
    const admin = staff.find((p) => p.role === "admin");
    const to = f.assigned_to || (f.kind === "dispute" ? admin?.id : "") || "";
    const { data: row, error } = await getBrowserClient()
      .from("staff_tasks")
      .insert({
        title: f.title.trim(),
        detail: f.detail.trim() || null,
        status: f.waiting_on.trim() ? "waiting" : "open",
        waiting_on: f.waiting_on.trim() || null,
        waiting_since: f.waiting_on.trim() ? todayISO() : null,
        due_date: f.due_date || null,
        kind: f.kind !== "other" ? f.kind : f.waiting_on.trim() ? "follow_up" : "other",
      })
      .select("id")
      .single();
    if (error) return setMsg(error.message);
    if (to) await assign(row.id, to);
    setF({ title: "", detail: "", waiting_on: "", due_date: "", kind: "other", assigned_to: "" });
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
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label htmlFor="tk-detail">Details (optional)</label>
          <input id="tk-detail" value={f.detail} onChange={(e) => setF((s) => ({ ...s, detail: e.target.value }))} placeholder="What Chuck or the team needs to know" />
        </div>
        <div className="field">
          <label htmlFor="tk-wait">Waiting on (optional)</label>
          <input id="tk-wait" value={f.waiting_on} onChange={(e) => setF((s) => ({ ...s, waiting_on: e.target.value }))} placeholder="Landlord, Chuck…" />
        </div>
        <div className="field">
          <label htmlFor="tk-due">Due (optional)</label>
          <input id="tk-due" type="date" value={f.due_date} onChange={(e) => setF((s) => ({ ...s, due_date: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="tk-kind">Type</label>
          <select id="tk-kind" value={f.kind} onChange={(e) => setF((s) => ({ ...s, kind: e.target.value }))}>
            <option value="other">Task</option>
            <option value="dispute">PM contract dispute</option>
            <option value="follow_up">Follow-up</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="tk-to">Assign to</label>
          <select id="tk-to" value={f.assigned_to} onChange={(e) => setF((s) => ({ ...s, assigned_to: e.target.value }))}>
            <option value="">{f.kind === "dispute" ? "Rosie to sort (default)" : "Nobody yet"}</option>
            {staff.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
            {partners.length ? (
              <optgroup label="Field (shows in their portal)">
                {partners.map((p) => (
                  <option key={p.id} value={`partner:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </div>
        <div>
          <button type="submit" className="btn primary sm">
            Add Task
          </button>
        </div>
      </form>
      {msg ? <div className="warnbox">{msg}</div> : null}
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <div className="seg">
          <button type="button" aria-pressed={tab === "open"} onClick={() => setTab("open")}>
            Open
          </button>
          <button type="button" aria-pressed={tab === "done"} onClick={() => setTab("done")}>
            Done
          </button>
        </div>
        <div className="seg">
          <button type="button" aria-pressed={who === "mine"} onClick={() => setWho("mine")}>
            Mine
          </button>
          <button type="button" aria-pressed={who === "unassigned"} onClick={() => setWho("unassigned")}>
            Unassigned
          </button>
          <button type="button" aria-pressed={who === "all"} onClick={() => setWho("all")}>
            Everyone
          </button>
          {partners.length ? (
            <button type="button" aria-pressed={who === "partner"} onClick={() => setWho("partner")}>
              {partners.length === 1 ? partners[0].name.split(" ")[0] : "Field"}
            </button>
          ) : null}
        </div>
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
                  {t.partner_id ? ` · ${partnerName(t.partner_id)} (in his portal)` : t.assigned_to ? ` · ${nameOf(t.assigned_to) || "assigned"}` : " · unassigned"}
                  {t.due_date ? ` · due ${shortDate(t.due_date)}` : ""}
                </span>
              </div>
              {t.detail ? <p className="small" style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{t.detail}</p> : null}
              {t.partner_done_at ? (
                <p className="small" style={{ margin: "4px 0" }}>
                  <b>{partnerName(t.partner_id)} marked it done {shortDate(String(t.partner_done_at).slice(0, 10))}</b>
                  {t.partner_note ? `: “${t.partner_note}”` : "."}
                </p>
              ) : null}
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
                  <select aria-label="Assign to" value={t.partner_id ? `partner:${t.partner_id}` : t.assigned_to || ""} onChange={(e) => assign(t.id, e.target.value)} className="small">
                    <option value="">Unassigned</option>
                    {staff.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name || p.email}
                      </option>
                    ))}
                    {partners.length ? (
              <optgroup label="Field (shows in their portal)">
                {partners.map((p) => (
                  <option key={p.id} value={`partner:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
                  </select>
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
