"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppFileButton from "@/components/AppFileButton";
import AppThread from "@/components/AppThread";
import ReferenceList from "@/components/ReferenceList";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import { INCOME_TYPES } from "@/lib/documents";
import { listingTitle, money } from "@/lib/format";
import { prettyDateTime } from "@/lib/admin-requests";
import { OWNER_STATUS, appApi, docLabel } from "@/lib/application-client";

const LABELS = { owner: "You", staff: "IRep", applicant: "Applicant" };
const PILL = { pending: "rv-pending", approved: "rv-approved", declined: "rv-declined", info_requested: "rv-info" };

export async function loadOwnerApplications() {
  const { data, error } = await getBrowserClient().rpc("owner_applications");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function placeOf(listing) {
  return listing ? listingTitle(listing) : "your property";
}

function Decision({ app, onDone }) {
  const [mode, setMode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noteId = `dec-note-${app.id}`;

  async function decide(decision, text) {
    setBusy(true);
    setError("");
    const res = await appApi(app.id, "decide", { body: { decision, note: text } });
    setBusy(false);
    if (res.error) return setError(res.error);
    setMode("");
    setNote("");
    onDone();
  }

  function approve() {
    if (!window.confirm(`Approve ${app.applicant_name} for ${placeOf(app.listing)}? IRep will then offer the lease.`)) return;
    decide("approved", "");
  }

  function submit(e) {
    e.preventDefault();
    if (mode === "info_requested" && !note.trim()) return setError("Write your question first.");
    decide(mode, note.trim());
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <h4 className="eyebrow">Your decision</h4>
      <div className="row">
        <button type="button" className="btn primary sm" onClick={approve} disabled={busy}>
          Approve Applicant
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setMode("declined")} aria-pressed={mode === "declined"} disabled={busy}>
          Decline
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setMode("info_requested")}
          aria-pressed={mode === "info_requested"}
          disabled={busy}
        >
          Ask the applicant a question
        </button>
      </div>
      {mode ? (
        <form className="boxed stack" style={{ gap: 10 }} onSubmit={submit}>
          <div className="field">
            <label htmlFor={noteId}>{mode === "declined" ? "Note for IRep (optional)" : "Your question"}</label>
            <textarea
              id={noteId}
              value={note}
              maxLength={4000}
              required={mode === "info_requested"}
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="small">
              {mode === "declined"
                ? "This note goes to IRep only. It isn't sent to the applicant."
                : "Sent to the applicant. IRep is copied."}
            </span>
          </div>
          <div className="row">
            <button type="submit" className="btn primary sm" disabled={busy}>
              {busy ? "Sending…" : mode === "declined" ? "Decline applicant" : "Send question"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setMode("")}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p className="small err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ApplicantDetail({ app, onReload }) {
  const [thanks, setThanks] = useState(false);
  const docs = Array.isArray(app.documents) ? app.documents : [];
  const decided = app.review_status === "approved" || app.review_status === "declined";

  return (
    <div className="stack" style={{ gap: 20 }}>
      <dl className="req-facts">
        <div>
          <dt>Applicant</dt>
          <dd>{app.applicant_name}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>
            {app.applicant_phone ? <a href={`tel:${String(app.applicant_phone).replace(/[^\d+]/g, "")}`}>{app.applicant_phone}</a> : "Not given"}
          </dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{app.applicant_email ? <a href={`mailto:${app.applicant_email}`}>{app.applicant_email}</a> : "Not given"}</dd>
        </div>
        <div>
          <dt>Current address</dt>
          <dd>{app.applicant_address || "Not given"}</dd>
        </div>
        <div>
          <dt>Income type</dt>
          <dd>{INCOME_TYPES[app.income_type]?.label || "Not given"}</dd>
        </div>
        {app.listing?.rent ? (
          <div>
            <dt>Rent</dt>
            <dd>{money(app.listing.rent)} / month</dd>
          </div>
        ) : null}
      </dl>

      <div className="stack" style={{ gap: 8 }}>
        <h4 className="eyebrow">Documents</h4>
        {docs.length ? (
          <ul className="doc-list">
            {docs.map((d, i) => {
              const label = docLabel(d.type, app.income_type);
              return (
                <li key={`${d.type}-${i}`}>
                  <span className="doc-name">
                    <b>{label}</b>
                  </span>
                  <AppFileButton appId={app.id} doc={d.type} label={`View ${label}`} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="small">No documents are available.</p>
        )}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h4 className="eyebrow">Credit check</h4>
        <p>{app.credit_summary || "IRep hasn't added a summary yet."}</p>
        {app.credit_checked_at ? <p className="small">Checked {prettyDateTime(app.credit_checked_at)}</p> : null}
        {app.credit_report ? (
          <div>
            <AppFileButton appId={app.id} doc="credit" label="View credit report" />
          </div>
        ) : null}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h4 className="eyebrow">References</h4>
        <ReferenceList references={app.references} />
        {app.reference_notes ? (
          <div className="ref-notes">
            <span className="eyebrow">IRep&apos;s Reference Check</span>
            <p>{app.reference_notes}</p>
          </div>
        ) : null}
      </div>

      <AppThread
        appId={app.id}
        messages={Array.isArray(app.messages) ? app.messages : []}
        labels={LABELS}
        mine="owner"
        onSent={onReload}
        replyLabel="Send a message"
        hint="Sent to the applicant and IRep."
      />

      {thanks ? (
        <p className="okbox" role="status">
          Thanks, IRep has been notified.
        </p>
      ) : null}
      {decided ? (
        <p className="small">
          You {app.review_status === "approved" ? "approved" : "declined"} this applicant
          {app.decided_at ? ` on ${prettyDateTime(app.decided_at)}` : ""}.
          {app.decision_note ? ` Note: ${app.decision_note}` : ""}
        </p>
      ) : (
        <Decision
          app={app}
          onDone={() => {
            setThanks(true);
            onReload();
          }}
        />
      )}

      <p className="small privacy-note">
        These documents are shared with you only to decide on this application. Please don&apos;t download or forward them.
      </p>
    </div>
  );
}

export default function OwnerApplications({ focusId }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, apps: [], error: "" });

  const load = useCallback(async () => {
    try {
      const apps = await loadOwnerApplications();
      setState({ loading: false, apps, error: "" });
    } catch {
      setState((s) => ({ ...s, loading: false, error: "We couldn't load your applicants. Refresh the page to try again." }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, user?.id]);

  const { loading, apps, error } = state;
  const isPending = (a) => a.review_status === "pending" || a.review_status === "info_requested";
  const ordered = [...apps.filter(isPending), ...apps.filter((a) => !isPending(a))];

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <Link href="/owner" className="small">
          ← Owner portal
        </Link>
        <h1 className="admin-title">Applicants to Review</h1>
        <p className="small">IRep won&apos;t accept any applicant for your property without your approval.</p>
      </div>
      {loading ? <p className="small">Loading applicants…</p> : null}
      {error ? <div className="warnbox">{error}</div> : null}
      {!loading && !error && !apps.length ? (
        <div className="empty">
          <h2>No Applicants Yet</h2>
          <p>When IRep sends you an applicant to review, they&apos;ll appear here and we&apos;ll email you.</p>
        </div>
      ) : null}
      {ordered.length ? (
        <ul className="owner-apps">
          {ordered.map((a) => (
            <li key={a.id}>
              <details className="owner-app" open={focusId === a.id || (ordered.length === 1 && isPending(a))}>
                <summary>
                  <span className="owner-app-head">
                    <span className="eyebrow">{placeOf(a.listing)}</span>
                    <b>{a.applicant_name}</b>
                    {a.sent_at ? <span className="small">Sent {prettyDateTime(a.sent_at)}</span> : null}
                  </span>
                  <span className={`pill ${PILL[a.review_status] || "sub"}`}>{OWNER_STATUS[a.review_status] || a.review_status}</span>
                </summary>
                <ApplicantDetail app={a} onReload={load} />
              </details>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
