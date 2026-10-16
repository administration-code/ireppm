"use client";

import { useState } from "react";
import Link from "next/link";
import ContactLine from "@/components/admin/ContactLine";
import MoveInForm from "@/components/admin/MoveInForm";
import { getBrowserClient } from "@/lib/supabase";
import { listingTitle } from "@/lib/format";
import { DOC_BUCKET, DOC_TYPES, INCOME_TYPES } from "@/lib/documents";
import { APPLICATION_STATUS, prettyDateTime, updateRow } from "@/lib/admin-requests";

const SIGNED_LINK_SECONDS = 300;
const DELETE_AFTER_DAYS = 80;
const DOC_NAME = Object.fromEntries(DOC_TYPES.map((d) => [d.key, d.name]));

function DocumentRow({ doc }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function view() {
    setError("");
    setBusy(true);
    // Open the tab during the click so popup blockers allow it, then point it at the signed link.
    const tab = window.open("about:blank", "_blank");
    const { data, error: signError } = await getBrowserClient()
      .storage.from(DOC_BUCKET)
      .createSignedUrl(doc.path, SIGNED_LINK_SECONDS);
    setBusy(false);
    if (signError || !data?.signedUrl) {
      tab?.close();
      setError("Couldn't open this file. Try again.");
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = data.signedUrl;
    } else {
      setError("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
    }
  }

  return (
    <li>
      <span className="doc-name">
        <b>{DOC_NAME[doc.type] || doc.type || "Document"}</b>
        <span className="small">{doc.name}</span>
      </span>
      <button type="button" className="btn ghost sm" onClick={view} disabled={busy || !doc.path}>
        {busy ? "Opening…" : "View"}
        <span className="visually-hidden"> {DOC_NAME[doc.type] || doc.name}</span>
      </button>
      {error ? (
        <span className="small err" role="alert">
          {error}
        </span>
      ) : null}
    </li>
  );
}

function deletionDate(decidedAt) {
  const d = new Date(decidedAt);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + DELETE_AFTER_DAYS);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function RetentionNote({ app, hasDocs }) {
  if (app.status !== "declined" && app.status !== "withdrawn") return null;
  if (!hasDocs) return <p className="small retention-note">Documents deleted as promised in our privacy policy.</p>;
  const date = app.decided_at ? deletionDate(app.decided_at) : "";
  if (!date) return null;
  return (
    <p className="small retention-note">
      Documents will be deleted automatically on {date}, as promised in our privacy policy.
    </p>
  );
}

function ApplicationItem({ app, onChange }) {
  const [status, setStatus] = useState(app.status);
  const [notes, setNotes] = useState(app.staff_notes || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const docs = Array.isArray(app.documents) ? app.documents : [];
  const dirty = status !== app.status || notes !== (app.staff_notes || "");

  async function save() {
    setSaving(true);
    setMsg({ kind: "", text: "" });
    const changes = { status, staff_notes: notes.trim() || null };
    try {
      await updateRow("applications", app.id, changes);
      onChange({ ...app, ...changes });
      setNotes(changes.staff_notes || "");
      setMsg({ kind: "ok", text: "Saved." });
    } catch {
      setMsg({ kind: "err", text: "That didn't save. Try again." });
    }
    setSaving(false);
  }

  const statusId = `a-status-${app.id}`;
  const notesId = `a-notes-${app.id}`;

  return (
    <li className="req">
      <div className="req-top">
        <div className="req-who">
          <h3>{app.applicant_name}</h3>
          <ContactLine phone={app.applicant_phone} email={app.applicant_email} />
        </div>
        <span className={`pill as-${app.status}`}>{APPLICATION_STATUS[app.status] || app.status}</span>
      </div>

      <dl className="req-facts">
        <div>
          <dt>Listing</dt>
          <dd>{app.listing ? listingTitle(app.listing) : "Listing removed"}</dd>
        </div>
        <div>
          <dt>Income type</dt>
          <dd>{INCOME_TYPES[app.income_type]?.label || "Not given"}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{prettyDateTime(app.created_at)}</dd>
        </div>
        <div>
          <dt>Credit check</dt>
          <dd>{app.credit_consent ? `Consented ${prettyDateTime(app.consent_at)}` : "No consent"}</dd>
        </div>
      </dl>

      <div className="stack" style={{ gap: 8 }}>
        <h4 className="eyebrow">Documents</h4>
        {docs.length ? (
          <ul className="doc-list">
            {docs.map((d, i) => (
              <DocumentRow key={d.path || i} doc={d} />
            ))}
          </ul>
        ) : app.status === "declined" || app.status === "withdrawn" ? null : (
          <p className="small">No documents were attached to this application.</p>
        )}
        <RetentionNote app={app} hasDocs={docs.length > 0} />
      </div>

      <div className="req-edit">
        <div className="field">
          <label htmlFor={statusId}>Status</label>
          <select id={statusId} value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(APPLICATION_STATUS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={notesId}>Staff notes</label>
          <textarea
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Only staff can see these notes."
          />
        </div>
      </div>
      <div className="req-actions">
        <button type="button" className="btn primary sm" onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save"}
        </button>
        {msg.text ? (
          <span className={`small ${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>
            {msg.text}
          </span>
        ) : null}
      </div>
      {app.status === "approved" ? (
        <>
          <Link className="btn ghost sm" style={{ justifySelf: "start" }} href={`/admin/signatures/new?kind=lease&application=${app.id}`}>
            Send lease for signature
          </Link>
          <MoveInForm app={app} />
        </>
      ) : null}
    </li>
  );
}

export default function ApplicationsPanel({ applications, onChange }) {
  if (!applications.length) {
    return (
      <div className="empty">
        <h2>No applications yet</h2>
        <p>When a renter applies for a listing, their details and attached documents will appear here.</p>
      </div>
    );
  }
  return (
    <ul className="req-list">
      {applications.map((a) => (
        <ApplicationItem key={a.id} app={a} onChange={onChange} />
      ))}
    </ul>
  );
}
