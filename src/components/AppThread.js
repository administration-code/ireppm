"use client";

import { useState } from "react";
import { appApi } from "@/lib/application-client";
import { prettyDateTime } from "@/lib/admin-requests";

// Messages about one application between the landlord, the applicant and IRep.
// Accepts rows from application_messages ({sender_role, created_at}) or from owner_applications() ({from, at}).
export default function AppThread({
  appId,
  messages,
  labels,
  mine,
  onSent,
  canReply = true,
  heading = "Messages",
  replyLabel = "Reply",
  hint = "",
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const fieldId = `reply-${mine}-${appId}`;

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setMsg({ kind: "", text: "" });
    const res = await appApi(appId, "message", { body: { body } });
    setBusy(false);
    if (res.error) return setMsg({ kind: "err", text: res.error });
    setText("");
    setMsg({ kind: "ok", text: "Sent." });
    onSent?.();
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <h4 className="eyebrow">{heading}</h4>
      {messages.length ? (
        <ol className="thread">
          {messages.map((m, i) => {
            const from = m.from ?? m.sender_role;
            const at = m.at ?? m.created_at;
            return (
              <li key={m.id || i} className={from === mine ? "mine" : undefined}>
                <span className="who">
                  {labels[from] || from} · <time dateTime={at}>{prettyDateTime(at)}</time>
                </span>
                <span className="body">{m.body}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="small">No messages yet.</p>
      )}
      {canReply ? (
        <form className="stack" style={{ gap: 8 }} onSubmit={send}>
          <div className="field">
            <label htmlFor={fieldId}>{replyLabel}</label>
            <textarea
              id={fieldId}
              value={text}
              maxLength={4000}
              onChange={(e) => {
                setText(e.target.value);
                setMsg({ kind: "", text: "" });
              }}
            />
          </div>
          {hint ? <span className="small">{hint}</span> : null}
          <div className="row">
            <button type="submit" className="btn ghost sm" disabled={busy || !text.trim()}>
              {busy ? "Sending…" : "Send"}
            </button>
            {msg.text ? (
              <span className={`small ${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>
                {msg.text}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
