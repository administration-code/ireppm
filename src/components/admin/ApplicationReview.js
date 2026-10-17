"use client";

import { useCallback, useEffect, useState } from "react";
import AppFileButton from "@/components/AppFileButton";
import AppThread from "@/components/AppThread";
import ReferenceList from "@/components/ReferenceList";
import { getBrowserClient } from "@/lib/supabase";
import { REVIEW_STATUS, SCREENING_ACCEPT, SCREENING_BUCKET, appApi } from "@/lib/application-client";
import { prettyDateTime, updateRow } from "@/lib/admin-requests";
import { refreshStaffCounts } from "@/lib/admin-nav";

const LABELS = { owner: "Landlord", staff: "You (IRep)", applicant: "Applicant" };
const PILL = { pending: "rv-pending", approved: "rv-approved", declined: "rv-declined", info_requested: "rv-info" };
const OPEN = ["submitted", "reviewing"];

function Status({ text }) {
  if (!text?.text) return null;
  return (
    <span className={`small ${text.kind}`} role={text.kind === "err" ? "alert" : "status"}>
      {text.text}
    </span>
  );
}

function ReferencesBlock({ app, onChange }) {
  const [notes, setNotes] = useState(app.reference_notes || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const id = `refnotes-${app.id}`;

  async function save() {
    setBusy(true);
    setMsg(null);
    const reference_notes = notes.trim() || null;
    try {
      await updateRow("applications", app.id, { reference_notes });
      onChange({ ...app, reference_notes });
      setMsg({ kind: "ok", text: "Saved." });
    } catch {
      setMsg({ kind: "err", text: "That didn't save. Try again." });
    }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <h4 className="eyebrow">References</h4>
      <ReferenceList references={app.rental_references} />
      <div className="field">
        <label htmlFor={id}>Reference check notes</label>
        <textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <span className="small">What did they say? This note is shown to the landlord.</span>
      </div>
      <div className="row">
        <button type="button" className="btn ghost sm" onClick={save} disabled={busy || notes === (app.reference_notes || "")}>
          {busy ? "Saving…" : "Save notes"}
        </button>
        <Status text={msg} />
      </div>
    </div>
  );
}

function CreditBlock({ app, onChange }) {
  const [summary, setSummary] = useState(app.credit_summary || "");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const fileId = `credit-file-${app.id}`;
  const sumId = `credit-sum-${app.id}`;

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return setMsg({ kind: "err", text: "Upload a PDF, JPG or PNG." });
    if (file.size > 10 * 1024 * 1024) return setMsg({ kind: "err", text: "That file is over 10 MB." });
    setBusy("upload");
    setMsg(null);
    const sb = getBrowserClient();
    const ext = file.name.split(".").pop().toLowerCase();
    const path = `${app.id}/credit-${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from(SCREENING_BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (upErr) {
      setBusy("");
      return setMsg({ kind: "err", text: "The upload didn't work. Try again." });
    }
    const changes = { credit_report_path: path, credit_checked_at: new Date().toISOString() };
    try {
      await updateRow("applications", app.id, changes);
    } catch {
      await sb.storage.from(SCREENING_BUCKET).remove([path]);
      setBusy("");
      return setMsg({ kind: "err", text: "The report uploaded but didn't attach. Try again." });
    }
    if (app.credit_report_path && app.credit_report_path !== path) {
      await sb.storage.from(SCREENING_BUCKET).remove([app.credit_report_path]);
    }
    onChange({ ...app, ...changes });
    setBusy("");
    setMsg({ kind: "ok", text: "Credit report attached." });
  }

  // FrontLobby has no connection for other websites: copy what its form asks for, open it,
  // and mark the check as started (the daily job reminds staff if no report follows).
  async function startFrontLobby() {
    const prev = (app.rental_references || []).find((r) => r.kind === "previous_landlord");
    const text = [
      `Name: ${app.applicant_name || ""}`,
      `Email: ${app.applicant_email || ""}`,
      `Phone: ${app.applicant_phone || ""}`,
      `Date of birth: ${app.applicant_dob || "not given (ask the applicant, or let FrontLobby collect it)"}`,
      `Current address: ${app.applicant_address || ""}`,
      `Previous address: ${prev?.address || "not given"}`,
    ].join("\n");
    let copied = false;
    try {
      await navigator.clipboard.writeText(text); // before opening the tab, while this page has focus
      copied = true;
    } catch {}
    const tab = window.open("https://app.frontlobby.com/login", "_blank");
    if (tab) tab.opener = null;
    const started = new Date().toISOString();
    try {
      await updateRow("applications", app.id, { credit_check_started_at: started, credit_reminder_sent_at: null });
      onChange({ ...app, credit_check_started_at: started, credit_reminder_sent_at: null });
    } catch {}
    setMsg({
      kind: "ok",
      text: copied
        ? "Applicant details copied. In FrontLobby: Tenant Screening → Screen Tenant, then paste. Choose “applicant enters their own details” to have FrontLobby email them."
        : `Couldn't copy automatically. Details: ${text.replace(/\n/g, " · ")}`,
    });
    if (!tab) setMsg((m) => ({ ...m, text: `${m.text} (Your browser blocked the new tab: open app.frontlobby.com.)` }));
  }

  async function saveSummary() {
    setBusy("summary");
    setMsg(null);
    const credit_summary = summary.trim() || null;
    try {
      await updateRow("applications", app.id, { credit_summary });
      onChange({ ...app, credit_summary });
      setMsg({ kind: "ok", text: "Saved." });
    } catch {
      setMsg({ kind: "err", text: "That didn't save. Try again." });
    }
    setBusy("");
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <h4 className="eyebrow">Credit check (FrontLobby)</h4>
      <p className="small">
        Run it in FrontLobby (Tenant Screening → Screen Tenant). Download the report and upload it here. FrontLobby keeps reports for 45
        days.
      </p>
      <div className="row">
        <button type="button" className="btn ghost sm" onClick={startFrontLobby}>
          {app.credit_check_started_at ? "Copy details and open FrontLobby again" : "Start FrontLobby check"}
        </button>
        {app.credit_check_started_at && !app.credit_report_path ? (
          <span className="small">Check started {prettyDateTime(app.credit_check_started_at)}: waiting for the report</span>
        ) : null}
      </div>
      <div className="row">
        {app.credit_report_path ? (
          <>
            <span className="pill done">Report on file</span>
            {app.credit_checked_at ? <span className="small">Checked {prettyDateTime(app.credit_checked_at)}</span> : null}
            <AppFileButton appId={app.id} doc="credit" label="View report" />
          </>
        ) : (
          <span className="pill req">No report yet</span>
        )}
        <label htmlFor={fileId} className="btn ghost sm" aria-disabled={busy === "upload"}>
          {busy === "upload" ? "Uploading…" : app.credit_report_path ? "Replace credit report" : "Upload credit report"}
        </label>
        <input id={fileId} type="file" accept={SCREENING_ACCEPT} className="visually-hidden" onChange={upload} disabled={busy === "upload"} />
      </div>
      <div className="field">
        <label htmlFor={sumId}>Summary for the landlord</label>
        <input
          id={sumId}
          type="text"
          value={summary}
          placeholder="Score 712, no collections, 2 open accounts"
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>
      <div className="row">
        <button
          type="button"
          className="btn ghost sm"
          onClick={saveSummary}
          disabled={busy === "summary" || summary === (app.credit_summary || "")}
        >
          {busy === "summary" ? "Saving…" : "Save summary"}
        </button>
        <Status text={msg} />
      </div>
    </div>
  );
}

function RecordDecision({ app, onDone }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState("approved");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const base = `rec-${app.id}`;

  async function submit(e) {
    e.preventDefault();
    if (decision === "info_requested" && !note.trim()) return setMsg({ kind: "err", text: "Write the landlord's question." });
    setBusy(true);
    setMsg(null);
    const res = await appApi(app.id, "decide", { body: { decision, note: note.trim() } });
    setBusy(false);
    if (res.error) return setMsg({ kind: "err", text: res.error });
    setOpen(false);
    setNote("");
    onDone();
  }

  if (!open) {
    return (
      <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>
        {"Record landlord's decision"}
      </button>
    );
  }
  return (
    <form className="boxed stack" style={{ gap: 10 }} onSubmit={submit}>
      <p className="small">For when the landlord answered by phone or email.</p>
      <div className="field">
        <label htmlFor={`${base}-d`}>Decision</label>
        <select id={`${base}-d`} value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="info_requested">Has a question for the applicant</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${base}-n`}>{decision === "info_requested" ? "Question (sent to the applicant)" : "Note (optional)"}</label>
        <textarea id={`${base}-n`} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="row">
        <button type="submit" className="btn primary sm" disabled={busy}>
          {busy ? "Saving…" : "Save decision"}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <Status text={msg} />
      </div>
    </form>
  );
}

export default function ApplicationReview({ app, onChange, onAccept }) {
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const docs = Array.isArray(app.documents) ? app.documents : [];
  const refs = Array.isArray(app.rental_references) ? app.rental_references.filter((r) => r?.name) : [];
  const review = app.owner_review_status || "not_sent";
  const sent = review !== "not_sent";

  const loadMessages = useCallback(async () => {
    const { data } = await getBrowserClient()
      .from("application_messages")
      .select("*")
      .eq("application_id", app.id)
      .order("created_at");
    setMessages(data || []);
  }, [app.id]);

  // Re-reads the review columns after a server route changes them.
  const reload = useCallback(async () => {
    const { data } = await getBrowserClient()
      .from("applications")
      .select("status, owner_id, owner_review_status, owner_review_sent_at, owner_decided_at, owner_decision_note")
      .eq("id", app.id)
      .maybeSingle();
    if (data) onChange({ ...app, ...data });
    loadMessages();
    refreshStaffCounts();
  }, [app, onChange, loadMessages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  async function send() {
    setSending(true);
    setMsg(null);
    const res = await appApi(app.id, "send-to-owner");
    setSending(false);
    if (res.error) return setMsg({ kind: "err", text: res.error });
    const o = res.owner || {};
    setMsg({ kind: "ok", text: `Sent to ${o.owner_name || "the landlord"}${o.owner_email ? ` (${o.owner_email})` : ""}` });
    reload();
  }

  const isOpen = OPEN.includes(app.status);

  return (
    <div className="review stack" style={{ gap: 20 }}>
      <ReferencesBlock app={app} onChange={onChange} />
      <CreditBlock app={app} onChange={onChange} />

      <div className="stack" style={{ gap: 10 }}>
        <h4 className="eyebrow">Landlord approval</h4>
        {sent ? (
          <div className="stack" style={{ gap: 6 }}>
            <div className="row">
              <span className={`pill ${PILL[review] || "sub"}`}>{REVIEW_STATUS[review] || review}</span>
              {app.owner_review_sent_at ? <span className="small">Sent {prettyDateTime(app.owner_review_sent_at)}</span> : null}
              {app.owner_decided_at ? <span className="small">Decided {prettyDateTime(app.owner_decided_at)}</span> : null}
            </div>
            {app.owner_decision_note ? <p className="small">Landlord&apos;s note: {app.owner_decision_note}</p> : null}
          </div>
        ) : (
          <ul className="checklist">
            <li className={docs.length ? "ok" : "no"}>Documents {docs.length ? `✓ (${docs.length})` : "✗"}</li>
            <li className={refs.length ? "ok" : "no"}>References ({refs.length})</li>
            <li className={app.credit_report_path ? "ok" : "no"}>Credit report {app.credit_report_path ? "✓" : "✗"}</li>
          </ul>
        )}
        {isOpen ? (
          <div className="row">
            <button type="button" className={sent ? "btn ghost sm" : "btn primary sm"} onClick={send} disabled={sending}>
              {sending ? "Sending…" : sent ? "Resend to landlord" : "Send to landlord for approval"}
            </button>
            {sent ? <RecordDecision app={app} onDone={reload} /> : null}
            <Status text={msg} />
          </div>
        ) : null}
        {review === "approved" && isOpen ? (
          <div className="okbox row">
            <span>The landlord approved this applicant.</span>
            <button type="button" className="btn primary sm" onClick={onAccept}>
              Landlord approved: accept and send the lease
            </button>
          </div>
        ) : null}
      </div>

      <AppThread
        appId={app.id}
        messages={messages}
        labels={LABELS}
        mine="staff"
        onSent={loadMessages}
        canReply={sent}
        replyLabel="Message the applicant and landlord"
        hint="The applicant and the landlord are both emailed."
      />
    </div>
  );
}
