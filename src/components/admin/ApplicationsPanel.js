"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ContactLine from "@/components/admin/ContactLine";
import MoveInForm from "@/components/admin/MoveInForm";
import DeleteRecord from "@/components/admin/DeleteRecord";
import { deleteLeasingRecord } from "@/lib/delete-records";
import AppFileButton from "@/components/AppFileButton";
import ApplicationReview from "@/components/admin/ApplicationReview";
import DeclineNotice from "@/components/admin/DeclineNotice";
import { listingTitle } from "@/lib/format";
import { INCOME_TYPES } from "@/lib/documents";
import { docLabel } from "@/lib/application-client";
import { APPLICATION_STATUS, prettyDateTime, updateRow } from "@/lib/admin-requests";

const DELETE_AFTER_DAYS = 80;
const UNAPPROVED_WARNING = "The landlord hasn't approved this applicant. Approve anyway?";

function DocumentRow({ appId, doc, incomeType }) {
  const label = docLabel(doc.type, incomeType);
  return (
    <li>
      <span className="doc-name">
        <b>{label}</b>
        <span className="small">{doc.name}</span>
      </span>
      {doc.path ? <AppFileButton appId={appId} doc={doc.type} label={`View ${label}`} /> : null}
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

// A renter can apply to the same listing again after withdrawing or being declined.
// Show the newest application, with earlier ones tucked underneath it.
function groupApplications(applications) {
  const groups = new Map();
  for (const a of applications) {
    const key = `${a.user_id || a.applicant_email}:${a.listing_id || a.listing?.slug || a.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  return [...groups.values()].map((list) => {
    const sorted = [...list].sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
    return { latest: sorted[0], earlier: sorted.slice(1) };
  });
}

function shortDate(iso) {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function ApplicationItem({ app, onChange, onRemove, earlier = [] }) {
  const [status, setStatus] = useState(app.status);
  const [notes, setNotes] = useState(app.staff_notes || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const docs = Array.isArray(app.documents) ? app.documents : [];
  const dirty = status !== app.status || notes !== (app.staff_notes || "");
  // Keep the drop-down in step when the status changes elsewhere (e.g. sending to the landlord).
  useEffect(() => {
    setStatus(app.status);
  }, [app.status]);

  async function save(nextStatus = status) {
    if (nextStatus === app.status && notes === (app.staff_notes || "")) {
      setMsg({ kind: "ok", text: `Nothing to save: it's already "${APPLICATION_STATUS[app.status] || app.status}". Pick a different status or change the notes.` });
      return;
    }
    if (nextStatus === "approved" && app.status !== "approved" && app.owner_review_status !== "approved") {
      if (!window.confirm(UNAPPROVED_WARNING)) return;
    }
    setSaving(true);
    setMsg({ kind: "", text: "" });
    setStatus(nextStatus);
    const changes = { status: nextStatus, staff_notes: notes.trim() || null };
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
          {app.applicant_address ? <span className="small">Current address: {app.applicant_address}</span> : null}
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
              <DocumentRow key={d.path || i} appId={app.id} doc={d} incomeType={app.income_type} />
            ))}
          </ul>
        ) : app.status === "declined" || app.status === "withdrawn" ? null : (
          <p className="small">No documents were attached to this application.</p>
        )}
        <RetentionNote app={app} hasDocs={docs.length > 0} />
      </div>

      <ApplicationReview app={app} onChange={onChange} onAccept={() => save("approved")} />

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
        <button type="button" className="btn primary sm" onClick={() => save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {msg.text ? (
          <span className={`small ${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>
            {msg.text}
          </span>
        ) : null}
        <span className="req-actions-end">
          <DeleteRecord
            summary={`the application from ${app.applicant_name || app.applicant_email || "this renter"}`}
            run={(reason) => deleteLeasingRecord("application", app.id, reason)}
            onDeleted={() => onRemove(app.id)}
          />
        </span>
      </div>
      {app.status === "declined" ? <DeclineNotice app={app} onChange={onChange} /> : null}
      {app.status === "approved" ? (
        <>
          <Link className="btn ghost sm" style={{ justifySelf: "start" }} href={`/admin/signatures/new?kind=lease&application=${app.id}`}>
            Send Lease for Signature
          </Link>
          <MoveInForm app={app} />
        </>
      ) : null}
      {earlier.length ? (
        <div className="app-earlier">
          {earlier.map((e) => (
            <details key={e.id}>
              <summary>
                Earlier application ({(APPLICATION_STATUS[e.status] || e.status).toLowerCase()}, {shortDate(e.created_at)})
              </summary>
              <ul className="req-list">
                <ApplicationItem app={e} onChange={onChange} onRemove={onRemove} />
              </ul>
            </details>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export default function ApplicationsPanel({ applications, onChange, onRemove }) {
  if (!applications.length) {
    return (
      <div className="empty">
        <h2>No Applications Yet</h2>
        <p>When a renter applies for a listing, their details and attached documents will appear here.</p>
      </div>
    );
  }
  return (
    <ul className="req-list">
      {groupApplications(applications).map(({ latest, earlier }) => (
        <ApplicationItem key={latest.id} app={latest} earlier={earlier} onChange={onChange} onRemove={onRemove} />
      ))}
    </ul>
  );
}
