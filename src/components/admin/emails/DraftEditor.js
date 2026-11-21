"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate } from "@/lib/rent";
import { SITE } from "@/lib/site";
import EmailTabs from "./EmailTabs";

// Staff: review and edit a draft, then send it from administration@ireppm.ca (copying administration@).
export default function DraftEditor({ id }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ to: "", subject: "", body: "" });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });

  async function load() {
    const { data } = await getBrowserClient().from("email_drafts").select("*").eq("id", id).maybeSingle();
    setD(data || false);
    if (data) setF({ to: (data.to_emails || []).join(", "), subject: data.subject, body: data.body });
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toList = () => f.to.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

  async function save() {
    setBusy("save");
    const { error } = await getBrowserClient().from("email_drafts").update({ to_emails: toList(), subject: f.subject, body: f.body }).eq("id", id);
    setBusy("");
    if (error) return setMsg({ kind: "err", text: error.message }), false;
    setMsg({ kind: "ok", text: "Saved." });
    return true;
  }

  async function send() {
    if (!(await save())) return;
    if (!window.confirm(`Send this email to ${toList().join(", ")} (copy to ${SITE.email})?`)) return;
    setBusy("send");
    const { data } = await getBrowserClient().auth.getSession();
    const res = await fetch(`/api/emails/${id}/send`, { method: "POST", headers: { Authorization: `Bearer ${data?.session?.access_token || ""}` } }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy("");
    if (!res?.ok) return setMsg({ kind: "err", text: json.error || "The email didn't send." });
    setMsg({ kind: "ok", text: `Sent to ${json.to.join(", ")}.` });
    load();
  }

  async function discard() {
    if (!window.confirm("Discard this draft?")) return;
    await getBrowserClient().from("email_drafts").update({ status: "discarded" }).eq("id", id);
    load();
  }

  if (d === null) return <p className="small">Loading…</p>;
  if (d === false) return <div className="warnbox">This draft wasn&apos;t found.</div>;
  const locked = d.status !== "draft";

  return (
    <div className="stack" style={{ gap: 20 }}>
      <EmailTabs
        title={d.status === "sent" ? "Sent Email" : d.status === "discarded" ? "Discarded Draft" : "Review Draft"}
        subtitle={
          d.status === "sent"
            ? `Sent ${shortDate(String(d.sent_at).slice(0, 10))} from ${SITE.email}.`
            : `From ${SITE.email}, with a copy to ${SITE.email}.${d.source === "ai" ? " Drafted by the assistant: check it carefully." : ""}`
        }
      />
      <fieldset className="boxed stack" disabled={locked || Boolean(busy)} style={{ border: 0 }}>
        <div className="field">
          <label htmlFor="de-to">To (separate with commas)</label>
          <input id="de-to" value={f.to} onChange={(e) => setF((s) => ({ ...s, to: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="de-subj">Subject</label>
          <input id="de-subj" value={f.subject} onChange={(e) => setF((s) => ({ ...s, subject: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="de-body">Message</label>
          <textarea id="de-body" rows={16} value={f.body} onChange={(e) => setF((s) => ({ ...s, body: e.target.value }))} />
        </div>
      </fieldset>
      {msg.text ? <div className={msg.kind === "err" ? "warnbox" : "okbox"}>{msg.text}</div> : null}
      {!locked ? (
        <div className="req-actions">
          <button type="button" className="btn primary" onClick={send} disabled={Boolean(busy)}>
            {busy === "send" ? "Sending…" : "Send"}
          </button>
          <button type="button" className="btn ghost" onClick={save} disabled={Boolean(busy)}>
            Save Draft
          </button>
          <button type="button" className="link-btn small" onClick={discard} disabled={Boolean(busy)}>
            Discard
          </button>
        </div>
      ) : (
        <Link href="/admin/emails">Back to emails</Link>
      )}
    </div>
  );
}
