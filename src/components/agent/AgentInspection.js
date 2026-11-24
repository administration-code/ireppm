"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import InspectionReportForm from "@/components/InspectionReportForm";

async function authHeader() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

// Vendors fill in an inspection report for one of their properties.
export default function AgentInspection() {
  const { user, ready, openSignIn } = useAuth();
  const [props, setProps] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [done, setDone] = useState(null); // { sent, to, later }
  const [open, setOpen] = useState(null); // draft being finished: { id, form, updated_at } or "new"
  const draftId = useRef(null);
  const finished = useRef(false);

  async function load() {
    const res = await fetch("/api/agent/inspections", { headers: await authHeader() });
    const json = await res.json().catch(() => ({}));
    setProps(res.ok ? json.properties || [] : []);
    setDrafts(res.ok ? json.drafts || [] : []);
  }
  useEffect(() => {
    if (user) load();
  }, [user]);

  function start(d) {
    draftId.current = d?.id || null;
    finished.current = false;
    setDone(null);
    setOpen(d ? { ...d, form: { ...(d.form || {}), _saved_at: d.updated_at } } : "new");
    window.scrollTo(0, 0);
  }
  async function discard(d) {
    await fetch("/api/agent/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ action: "discard", draft_id: d.id }),
    });
    setDrafts((x) => x.filter((y) => y.id !== d.id));
  }
  async function saveDraft(form) {
    if (finished.current) return { saved_at: new Date().toISOString() };
    const { _saved_at, ...clean } = form;
    const res = await fetch("/api/agent/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ action: "draft", draft_id: draftId.current, form: clean }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Not saved. Check your connection.");
    draftId.current = json.draft_id;
    return json;
  }

  if (!ready) return <p className="small">Loading…</p>;
  if (!user)
    return (
      <div className="empty">
        <h1>Inspection Report</h1>
        <button type="button" className="btn primary" onClick={() => openSignIn("/agent/inspection")}>
          Sign in
        </button>
      </div>
    );
  if (!props) return <p className="small">Loading your properties…</p>;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <Link className="back" href="/agent">
          ← Agent Portal
        </Link>
        <span className="eyebrow">Agent Portal</span>
        <h1 className="admin-title">Inspection Report</h1>
      </div>
      {done ? (
        <div className="okbox stack" role="status">
          <p style={{ margin: 0 }}>
            {done.later
              ? "Saved. Finish it any time from this page."
              : done.sent
                ? `Sent to the landlord (${done.to}). They approve the items they want in their portal, and approved ones show up on your Open Jobs list. They may email you with questions.`
                : "Saved, but it couldn't be emailed to the landlord. IRep has been told and will send it."}
          </p>
          <div className="req-actions">
            <button type="button" className="btn ghost sm" onClick={() => setDone(null)}>
              {done.later ? "Back to inspections" : "Start another report"}
            </button>
            <Link className="btn ghost sm" href="/agent">
              Back to the portal
            </Link>
          </div>
        </div>
      ) : !props.length ? (
        <p className="small">IRep hasn&apos;t assigned you to any managed properties yet.</p>
      ) : !open ? (
        <div className="stack" style={{ gap: 16 }}>
          {drafts.length ? (
            <section className="boxed stack" aria-labelledby="ai-drafts">
              <h2 id="ai-drafts" className="sec-title">
                Finish a Saved Report
              </h2>
              <ul className="plain-list stack" style={{ gap: 10 }}>
                {drafts.map((d) => (
                  <li key={d.id} className="req-actions" style={{ justifyContent: "space-between" }}>
                    <span>
                      <b>{d.address}</b>
                      <span className="small sub-line">Saved {new Date(d.updated_at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" })}</span>
                    </span>
                    <span className="req-actions">
                      <button type="button" className="btn primary sm" style={{ minHeight: 44 }} onClick={() => start(d)}>
                        Continue
                      </button>
                      <button type="button" className="btn ghost sm" style={{ minHeight: 44 }} onClick={() => discard(d)}>
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div>
            <button type="button" className="btn primary" style={{ minHeight: 48 }} onClick={() => start(null)}>
              Start a New Inspection
            </button>
          </div>
        </div>
      ) : (
        <InspectionReportForm
          key={open === "new" ? "new" : open.id}
          properties={props}
          initial={open === "new" ? null : open.form}
          submitLabel="Inspection Complete: Send to Landlord"
          onSaveDraft={saveDraft}
          onLater={() => {
            setOpen(null);
            setDone({ later: true });
            load();
            window.scrollTo(0, 0);
          }}
          onSubmit={async (form) => {
            finished.current = true;
            const { _saved_at, ...clean } = form;
            const res = await fetch("/api/agent/inspections", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(await authHeader()) },
              body: JSON.stringify({ ...clean, draft_id: draftId.current }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              finished.current = false;
              throw new Error(json.error || "That didn't save. Try again.");
            }
            draftId.current = null;
            setOpen(null);
            setDone({ sent: json.sent, to: json.to });
            load();
            window.scrollTo(0, 0);
          }}
        />
      )}
    </div>
  );
}
