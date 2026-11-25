"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import { blankItem, blankUnit } from "@/lib/inspection-reports";
import InspectionReportForm from "@/components/InspectionReportForm";

async function authHeader() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

// Vendors fill in an inspection report for one of their properties.
const fmt = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

export default function AgentInspection() {
  const { user, ready, openSignIn } = useAuth();
  const [props, setProps] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [last, setLast] = useState({});
  const [due, setDue] = useState([]);
  const [done, setDone] = useState(null); // { sent, to, later }
  const [open, setOpen] = useState(null); // draft being finished: { id, form, updated_at } or "new"
  const draftId = useRef(null);
  const finished = useRef(false);

  async function load() {
    const res = await fetch("/api/agent/inspections", { headers: await authHeader() });
    const json = await res.json().catch(() => ({}));
    setProps(res.ok ? json.properties || [] : []);
    setDrafts(res.ok ? json.drafts || [] : []);
    setLast(res.ok ? json.last || {} : {});
    setDue(res.ok ? json.due || [] : []);
  }
  useEffect(() => {
    if (user) load();
  }, [user]);

  function start(d, propertyId = null) {
    draftId.current = d?.id || null;
    finished.current = false;
    setDone(null);
    const p = propertyId ? props.find((x) => x.id === propertyId) : null;
    setOpen(
      d
        ? { ...d, form: { ...(d.form || {}), _saved_at: d.updated_at } }
        : p
          ? {
              id: `new-${p.id}`,
              form: {
                _fresh: true,
                property_id: p.id,
                inspected_on: new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }),
                units: p.units.map(blankUnit),
                items: [blankItem()],
                photos: {},
                prices: {},
                check_details: {},
              },
            }
          : "new"
    );
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
          {due.length ? (
            <section className="boxed stack" aria-labelledby="ai-due">
              <h2 id="ai-due" className="sec-title">
                Inspections This Season
              </h2>
              <p className="small" style={{ margin: 0 }}>
                Twice a year: pre-winter (Oct 1 to Nov 30) and post-winter (Mar 1 to Apr 30). This first round runs to Dec 31. Pick a day and time
                for each property; the tenants get their 24-hour notice by email automatically. You&apos;re paid for each one you send.
              </p>
              <ul className="plain-list stack" style={{ gap: 12 }}>
                {due.map((x) => (
                  <DueRow key={x.id} x={x} onStart={() => start(null, x.id)} onChange={load} />
                ))}
              </ul>
            </section>
          ) : null}
          <div>
            <button type="button" className="btn ghost" style={{ minHeight: 48 }} onClick={() => start(null)}>
              Start a Different Inspection
            </button>
          </div>
        </div>
      ) : (
        <InspectionReportForm
          key={open === "new" ? "new" : open.id}
          properties={props}
          lastByProperty={last}
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

const TZ = "America/Toronto";
const dayLabel = (d) => d.toLocaleDateString("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const isoDay = (d) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const hourLabel = (h) => `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "pm" : "am"}`;
const whenShort = (iso) => new Date(iso).toLocaleString("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function post(body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch("/api/agent/inspections", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ error: "Something went wrong. Try again." }));
}

// One property in the season list: last inspection, status, and Schedule (tap a day, tap a time).
function DueRow({ x, onStart, onChange }) {
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState("");
  const [hour, setHour] = useState(null);
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const needs = ["overdue", "soon", "due"].includes(x.state);

  async function openPicker() {
    setPicking(true);
    setMsg({ kind: "", text: "" });
    const out = await post({ action: "recipients", property_id: x.id });
    setCount(typeof out.count === "number" ? out.count : null);
  }
  // The next 21 days from tomorrow; times less than 24 hours away are greyed out.
  const days = Array.from({ length: 21 }, (_, i) => new Date(Date.now() + (i + 1) * 86400000));
  const tooSoon = (d, h) => {
    const t = new Date(`${d}T${String(h).padStart(2, "0")}:00:00`);
    return t.getTime() - Date.now() < 24 * 3600000;
  };
  async function save() {
    if (!day || hour == null) return setMsg({ kind: "err", text: "Tap a day and a time." });
    setBusy(true);
    const out = await post({ action: "schedule", property_id: x.id, at: `${day}T${String(hour).padStart(2, "0")}:00` });
    setBusy(false);
    if (out.error) return setMsg({ kind: "err", text: out.error });
    setPicking(false);
    setMsg({
      kind: "ok",
      text: out.noEmails
        ? "Scheduled. No tenant there has an email on file, so give them written notice yourself at least 24 hours ahead."
        : `Scheduled. Notice emailed to ${out.sent} tenant${out.sent === 1 ? "" : "s"}.`,
    });
    onChange();
  }
  async function cancel() {
    setBusy(true);
    const out = await post({ action: "cancel", property_id: x.id, visit_id: x.visit.id });
    setBusy(false);
    if (out.error) return setMsg({ kind: "err", text: out.error });
    setMsg({ kind: "ok", text: "Cancelled. The tenants were told." });
    onChange();
  }

  const statusText =
    x.state === "overdue"
      ? `Missed: ${x.season} ended ${fmt(x.due)}`
      : x.state === "soon"
        ? `Due by ${fmt(x.due)} (${x.inDays} day${x.inDays === 1 ? "" : "s"} left)`
        : x.state === "due"
          ? `Due by ${fmt(x.due)}`
          : x.state === "done"
            ? `Done for ${x.season}`
            : x.next
              ? `Next: ${x.next.label}, ${fmt(x.next.start)} to ${fmt(x.next.end)}`
              : "Up to date";
  return (
    <li className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <div>
        <b>{x.address}</b>
        <span className="small sub-line">Last inspection: {x.last ? fmt(x.last) : "none on record"}</span>
        <span className="small sub-line" style={x.state === "overdue" ? { color: "#8a110c", fontWeight: 600 } : needs ? { fontWeight: 600 } : undefined}>
          {statusText}
        </span>
        {x.visit ? (
          <span className="small sub-line" style={{ color: "#2f6b3a", fontWeight: 600 }}>
            Scheduled {whenShort(x.visit.at)}
            {x.visit.notified ? ` · ${x.visit.notified} tenant${x.visit.notified === 1 ? "" : "s"} notified` : " · no tenant emails on file"}
          </span>
        ) : null}
      </div>
      {needs ? (
        <div className="req-actions" style={{ flexWrap: "wrap" }}>
          {x.visit ? (
            <>
              <button type="button" className="btn primary sm" style={{ minHeight: 44 }} onClick={onStart}>
                Start It
              </button>
              <button type="button" className="btn ghost sm" style={{ minHeight: 44 }} onClick={openPicker} disabled={busy}>
                Move It
              </button>
              <button type="button" className="btn ghost sm" style={{ minHeight: 44 }} onClick={cancel} disabled={busy}>
                Cancel It
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn primary sm" style={{ minHeight: 44 }} onClick={openPicker}>
                Pick a Day and Time
              </button>
              <button type="button" className="btn ghost sm" style={{ minHeight: 44 }} onClick={onStart}>
                Start It
              </button>
            </>
          )}
        </div>
      ) : null}
      {picking ? (
        <div className="stack" style={{ gap: 10, background: "var(--ivory, #F7F4EE)", borderRadius: 8, padding: 12 }}>
          <span className="small">Day</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {days.map((d) => {
              const v = isoDay(d);
              return (
                <button key={v} type="button" aria-pressed={day === v} className={`btn ${day === v ? "primary" : "ghost"} sm`} style={{ minHeight: 44, background: day === v ? undefined : "#fff" }} onClick={() => setDay(v)}>
                  {day === v ? "✓ " : ""}
                  {dayLabel(d)}
                </button>
              );
            })}
          </div>
          {day ? (
            <>
              <span className="small">Time (about 1 hour; between 8 am and 8 pm)</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={hour === h}
                    disabled={tooSoon(day, h)}
                    className={`btn ${hour === h ? "primary" : "ghost"} sm`}
                    style={{ minHeight: 44, background: hour === h ? undefined : "#fff" }}
                    onClick={() => setHour(h)}
                  >
                    {hour === h ? "✓ " : ""}
                    {hourLabel(h)}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <span className="small">
            {count === null
              ? "Checking who gets the notice…"
              : count
                ? `The notice goes by email to ${count} tenant${count === 1 ? "" : "s"}, asking them to tell anyone without an email on file. Common areas only; no bedrooms unless it's the attic access.`
                : "No tenant here has an email on file. You'll need to give them written notice yourself, at least 24 hours ahead."}
          </span>
          <div className="req-actions">
            <button type="button" className="btn primary" style={{ minHeight: 48 }} onClick={save} disabled={busy || !day || hour == null}>
              {busy ? "Sending…" : x.visit ? "Move It and Tell the Tenants" : "Schedule and Send the Notice"}
            </button>
            <button type="button" className="link-btn small" onClick={() => setPicking(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
      {msg.text ? (
        <span className={`small${msg.kind === "err" ? " err" : ""}`} role={msg.kind === "err" ? "alert" : "status"}>
          {msg.text}
        </span>
      ) : null}
    </li>
  );
}
