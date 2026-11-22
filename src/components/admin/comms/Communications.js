"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

export const LABELS = { maintenance: "Maintenance", rent: "Rent", lease: "Lease & Signatures", notices: "Notices", landlord: "Landlord", general: "General" };
const COLS = "id, message_id, thread_id, direction, from_name, from_email, to_emails, subject, snippet, received_at, category, label_source, answered_at, status, party_kind, party_name, attachments, hidden_attachments, maintenance_request_ids";
export const gmailLink = (threadId) => (threadId ? `https://mail.google.com/mail/?authuser=administration%40ireppm.ca#all/${threadId}` : null);

const when = (iso) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// Business days since a time (Mon–Fri).
function businessDaysSince(iso) {
  const cur = new Date(iso);
  const now = new Date();
  let n = 0;
  while (true) {
    cur.setDate(cur.getDate() + 1);
    if (cur > now) return n;
    if (cur.getDay() % 6 !== 0) n += 1;
  }
}
export const isUnanswered = (e) =>
  e.direction === "in" && !e.answered_at && e.status === "new" && ["tenant", "landlord"].includes(e.party_kind) && businessDaysSince(e.received_at) >= 1;

function Attachments({ list, hidden, threadId }) {
  const shown = (list || []).filter((a) => !a.hidden && a.name);
  if (!shown.length && !hidden) return null;
  return (
    <div className="small" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
      {shown.map((a, i) => (
        <span key={i} className="chip">
          📎 {a.name}
        </span>
      ))}
      {hidden ? (
        <a className="chip" href={gmailLink(threadId) || "#"} target="_blank" rel="noreferrer">
          {hidden === 1 ? "Attachment hidden" : `${hidden} attachments hidden`} — open in Gmail
        </a>
      ) : null}
    </div>
  );
}

// Staff: every email in and out of administration@ for a tenancy, landlord, unit or property,
// grouped by thread, newest first. Templates and "Draft with AI" start from here; sent ones appear here.
export default function Communications({ tenancyId, ownerId, unitId, propertyId, title = "Communications" }) {
  const [rows, setRows] = useState(null);
  const [label, setLabel] = useState("");
  const [open, setOpen] = useState({});
  useEffect(() => {
    let live = true;
    (async () => {
      const sb = getBrowserClient();
      const ors = [];
      if (tenancyId) ors.push(`tenancy_id.eq.${tenancyId}`);
      if (ownerId) ors.push(`owner_id.eq.${ownerId}`);
      if (unitId) ors.push(`unit_id.eq.${unitId}`);
      if (propertyId) {
        ors.push(`property_id.eq.${propertyId}`);
        const { data: p } = await sb.from("properties").select("owner_id").eq("id", propertyId).maybeSingle();
        if (p?.owner_id) ors.push(`owner_id.eq.${p.owner_id}`);
      }
      if (!ors.length) return setRows([]);
      const { data, error } = await sb.from("inbound_emails").select(COLS).or(ors.join(",")).order("received_at", { ascending: false }).limit(300);
      if (live) setRows(error ? [] : data || []);
    })();
    return () => {
      live = false;
    };
  }, [tenancyId, ownerId, unitId, propertyId]);

  const threads = useMemo(() => {
    const map = new Map();
    for (const r of (rows || []).filter((r) => !label || r.category === label)) {
      const k = r.thread_id || r.message_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return [...map.values()].map((msgs) => msgs.sort((a, b) => String(a.received_at).localeCompare(String(b.received_at))));
  }, [rows, label]);

  const newEmail = tenancyId ? `/admin/emails/new?tenancy=${tenancyId}` : ownerId ? `/admin/emails/new?owner=${ownerId}` : "/admin/emails/new";
  const ai = tenancyId ? `/admin/ask?tenancy=${tenancyId}` : "/admin/ask";
  const waiting = (rows || []).filter(isUnanswered).length;

  return (
    <section className="stack" style={{ gap: 12 }} id="communications">
      <div className="req-top" style={{ alignItems: "center" }}>
        <h2 className="h3" style={{ margin: 0 }}>
          {title}
          {waiting ? <span className="badge warn" style={{ marginLeft: 8 }}>{waiting} unanswered</span> : null}
        </h2>
        <div className="req-actions">
          <select aria-label="Label" value={label} onChange={(e) => setLabel(e.target.value)}>
            <option value="">All labels</option>
            {Object.entries(LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <a className="btn ghost sm" href={newEmail}>
            Send Template
          </a>
          {tenancyId ? (
            <a className="btn ghost sm" href={ai}>
              Draft with AI
            </a>
          ) : null}
        </div>
      </div>
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !threads.length ? (
        <p className="small">No emails yet. Emails to and from administration@ show here once the mailbox feed is running.</p>
      ) : (
        <ul className="req-list">
          {threads.map((msgs) => {
            const last = msgs[msgs.length - 1];
            const k = last.thread_id || last.message_id;
            const expanded = open[k];
            const shown = expanded ? msgs : [last];
            return (
              <li key={k} className="req">
                <div className="req-top">
                  <b>{msgs[0].subject || "(no subject)"}</b>
                  <span className="small">
                    {LABELS[last.category] || "Unlabelled"}
                    {msgs.length > 1 ? ` · ${msgs.length} emails` : ""}
                  </span>
                </div>
                {shown.map((m) => (
                  <div key={m.id} style={{ borderLeft: "3px solid var(--line, #ddd)", paddingLeft: 10, marginTop: 6 }}>
                    <span className="small">
                      {m.direction === "out" ? "→ Sent to " + (m.to_emails || []).filter((e) => !/@ireppm\.ca$/i.test(e)).join(", ") : "← From " + (m.from_name || m.from_email)} ·{" "}
                      {when(m.received_at)}
                      {isUnanswered(m) ? <b style={{ color: "var(--red, #B41710)" }}> · Unanswered</b> : null}
                    </span>
                    {m.snippet ? (
                      <p className="small" style={{ margin: "4px 0", whiteSpace: "pre-line" }}>
                        {m.snippet.slice(0, expanded ? 1500 : 280)}
                        {!expanded && m.snippet.length > 280 ? "…" : ""}
                      </p>
                    ) : null}
                    <Attachments list={m.attachments} hidden={m.hidden_attachments} threadId={m.thread_id} />
                    {(m.maintenance_request_ids || []).length ? (
                      <span className="small">
                        Logged as{" "}
                        {m.maintenance_request_ids.map((id, i) => (
                          <a key={id} href={`/admin/maintenance/${id}`}>
                            request {i + 1}{" "}
                          </a>
                        ))}
                      </span>
                    ) : null}
                  </div>
                ))}
                <div className="req-actions">
                  {msgs.length > 1 ? (
                    <button type="button" className="link-btn small" onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))}>
                      {expanded ? "Show latest only" : "Show whole thread"}
                    </button>
                  ) : null}
                  {gmailLink(last.thread_id) ? (
                    <a className="link-btn small" href={gmailLink(last.thread_id)} target="_blank" rel="noreferrer">
                      Open in Gmail
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
