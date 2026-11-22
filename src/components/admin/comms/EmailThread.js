"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { refreshStaffCounts } from "@/lib/admin-nav";
import { LABELS, gmailLink } from "@/components/admin/comms/Communications";

const COLS = "id, thread_id, direction, from_name, from_email, to_emails, subject, body, snippet, received_at, category, status, party_kind, party_name, tenancy_id, unit_id, property_id, attachments, hidden_attachments";
const KINDS = { dispute: "PM contract dispute", follow_up: "Follow-up", other: "Task" };
const when = (iso) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const who = (e) => (e.direction === "out" ? "IRep (administration@)" : e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email);

// Staff: one email and the rest of its conversation, readable in the portal (no Gmail access needed),
// with "Assign" to turn it into a task for a staff member.
export default function EmailThread({ id }) {
  const [email, setEmail] = useState(undefined);
  const [thread, setThread] = useState([]);
  const [staff, setStaff] = useState([]);
  const [f, setF] = useState({ assigned_to: "", kind: "follow_up", note: "", due_date: "" });
  const [msg, setMsg] = useState("");
  const [tasks, setTasks] = useState([]);

  async function loadTasks() {
    const { data } = await getBrowserClient().from("staff_tasks").select("id, title, status, assigned_to").eq("link", `/admin/inbox/${id}`).order("created_at", { ascending: false });
    setTasks(data || []);
  }
  useEffect(() => {
    (async () => {
      const sb = getBrowserClient();
      const [{ data: e }, { data: list }] = await Promise.all([sb.from("inbound_emails").select(COLS).eq("id", id).maybeSingle(), sb.rpc("staff_members")]);
      setEmail(e || null);
      setStaff(list || []);
      if (e?.thread_id) {
        const { data: t } = await sb.from("inbound_emails").select(COLS).eq("thread_id", e.thread_id).order("received_at");
        setThread(t || [e]);
      } else if (e) setThread([e]);
      loadTasks();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const nameOf = (uid) => {
    const p = staff.find((x) => x.id === uid);
    return p ? p.full_name || p.email : "nobody yet";
  };

  async function assign(e) {
    e.preventDefault();
    if (!f.assigned_to) return setMsg("Who should handle it?");
    setMsg("Assigning…");
    const sb = getBrowserClient();
    const subject = email.subject || "(no subject)";
    const from = email.party_name || email.from_name || email.from_email;
    const { data: row, error } = await sb
      .from("staff_tasks")
      .insert({
        kind: f.kind,
        title: `${f.kind === "dispute" ? "PM contract dispute" : "Email"} from ${from}: ${subject}`.slice(0, 200),
        detail: f.note.trim() || null,
        due_date: f.due_date || null,
        tenancy_id: email.tenancy_id,
        unit_id: email.unit_id,
        property_id: email.property_id,
        link: `/admin/inbox/${id}`,
        data: { email_id: id, thread_id: email.thread_id },
      })
      .select("id")
      .single();
    if (error) return setMsg(error.message);
    const { data: s } = await sb.auth.getSession();
    const res = await fetch(`/api/admin/tasks/${row.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.session?.access_token || ""}` },
      body: JSON.stringify({ assigned_to: f.assigned_to }),
    });
    if (!res.ok) return setMsg((await res.json().catch(() => ({}))).error || "The task was made but couldn't be assigned.");
    if (email.status === "new") await sb.from("inbound_emails").update({ status: "handled" }).eq("id", id);
    setMsg(`Assigned to ${nameOf(f.assigned_to)}. They've been emailed a link.`);
    setF({ assigned_to: "", kind: "follow_up", note: "", due_date: "" });
    refreshStaffCounts();
    loadTasks();
  }

  if (email === undefined) return <p className="small">Loading…</p>;
  if (!email) return <p className="small">That email isn't in the portal.</p>;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">
          <Link href="/admin/inbox">Inbox</Link> · {LABELS[email.category] || "Not sorted"}
        </span>
        <h1 className="admin-title">{email.subject || "(no subject)"}</h1>
        <p className="small">
          {email.party_kind && !["unmatched", "ignored"].includes(email.party_kind) ? `${email.party_kind[0].toUpperCase() + email.party_kind.slice(1)}: ${email.party_name || email.from_email}` : "Not matched to anyone"}
          {gmailLink(email.thread_id) ? (
            <>
              {" · "}
              <a href={gmailLink(email.thread_id)} target="_blank" rel="noreferrer">
                Open in Gmail (administration@ only)
              </a>
            </>
          ) : null}
        </p>
      </div>

      <form className="card stack" style={{ gap: 10 }} onSubmit={assign}>
        <b>Assign</b>
        <div className="req-actions" style={{ flexWrap: "wrap" }}>
          <select aria-label="Assign to" value={f.assigned_to} onChange={(e) => setF((s) => ({ ...s, assigned_to: e.target.value }))}>
            <option value="">Assign to…</option>
            {staff.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
          <select aria-label="Type" value={f.kind} onChange={(e) => setF((s) => ({ ...s, kind: e.target.value }))}>
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input type="date" aria-label="Due" value={f.due_date} onChange={(e) => setF((s) => ({ ...s, due_date: e.target.value }))} />
        </div>
        <textarea rows={2} placeholder="Note for them (optional)" value={f.note} onChange={(e) => setF((s) => ({ ...s, note: e.target.value }))} />
        <div className="req-actions">
          <button type="submit" className="btn sm">
            Assign
          </button>
          {msg ? <span className="small">{msg}</span> : null}
        </div>
        {tasks.length ? (
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {tasks.map((t) => (
              <li key={t.id}>
                {t.title} · {nameOf(t.assigned_to)} · {t.status}
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <ul className="req-list">
        {thread.map((m) => (
          <li key={m.id} className="req" style={m.id === id ? { outline: "2px solid var(--accent, #2b6)" } : undefined}>
            <div className="req-top">
              <b>{who(m)}</b>
              <span className="small">{when(m.received_at)}</span>
            </div>
            {m.to_emails?.length ? <span className="small">To {m.to_emails.join(", ")}</span> : null}
            <div className="small" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
              {m.body || m.snippet || "(no text)"}
            </div>
            {(m.attachments || []).some((a) => a.name && !a.hidden) || m.hidden_attachments ? (
              <span className="small">
                Attachments: {(m.attachments || []).filter((a) => a.name && !a.hidden).map((a) => a.name).join(", ")}
                {m.hidden_attachments ? `${(m.attachments || []).some((a) => a.name && !a.hidden) ? " · " : ""}${m.hidden_attachments} hidden (possible ID)` : ""}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
