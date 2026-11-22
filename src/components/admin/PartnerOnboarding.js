"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate, todayISO } from "@/lib/rent";
import { AREAS, CHECKLIST, ONBOARDING_PARTNER_ID as PID, RATINGS } from "@/lib/partner-onboarding";

const DOC = "https://claude.ai/artifact/6PxA9XVzbQxNEB5vmddHpT";
const since = () => new Date(Date.now() - 30 * 86400000).toISOString();
const latest = (rows, key) => (rows || []).map((r) => r[key]).filter(Boolean).sort().pop() || null;

// What Chuck has actually done in the portal in the last 30 days: the real measure of adoption.
async function loadUsage(sb) {
  const s = since();
  const [cash, deps, jobs, logged, vac, served] = await Promise.all([
    sb.from("cash_collections").select("created_at").eq("partner_id", PID).gte("created_at", s),
    sb.from("cash_deposits").select("created_at").eq("partner_id", PID).gte("created_at", s),
    sb.from("maintenance_requests").select("vendor_done_at").eq("partner_id", PID).gte("vendor_done_at", s),
    sb.from("maintenance_requests").select("created_at").eq("partner_id", PID).ilike("staff_notes", "Logged by%Agent Portal%").gte("created_at", s),
    sb.from("listings").select("created_at").eq("created_by_partner", PID).gte("created_at", s),
    sb.from("notices").select("created_at").ilike("notes", "%Served by Chuck (Agent Portal)%").gte("created_at", s),
  ]);
  const row = (label, r, key) => ({ label, n: (r.data || []).length, last: latest(r.data, key) });
  return [
    row("Cash payments logged", cash, "created_at"),
    row("Deposits recorded", deps, "created_at"),
    row("Jobs marked done", jobs, "vendor_done_at"),
    row("Maintenance requests logged", logged, "created_at"),
    row("Vacancies put up", vac, "created_at"),
    row("Notices marked delivered", served, "created_at"),
  ];
}

// The practice property (1 Practice St (TEST)): what Chuck has logged there, and a button to clear it.
function PracticeClear() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const call = async (method) => {
    const { data } = await getBrowserClient().auth.getSession();
    const res = await fetch("/api/admin/practice", { method, headers: { Authorization: `Bearer ${data?.session?.access_token || ""}` } });
    return res.json().catch(() => ({}));
  };
  const load = useCallback(async () => setD(await call("GET")), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!d?.ready) return null;
  const total = d.requests + d.cash + d.vacancies;
  return (
    <section className="boxed stack">
      <h2 className="sec-title">Practice Property</h2>
      <p className="small">
        Chuck can try things at 1 Practice St (TEST) without touching real tenants or money. Logged there now: {d.requests} request
        {d.requests === 1 ? "" : "s"}, {d.cash} cash entr{d.cash === 1 ? "y" : "ies"}, {d.vacancies} vacanc{d.vacancies === 1 ? "y" : "ies"}. Don&apos;t approve
        practice jobs in Jobs Done: clear them here instead.
      </p>
      <div className="req-actions">
        <button
          type="button"
          className="btn ghost sm"
          disabled={busy || !total}
          onClick={async () => {
            if (!window.confirm("Clear everything logged at the practice property?")) return;
            setBusy(true);
            await call("POST");
            setBusy(false);
            load();
          }}
        >
          {busy ? "Clearing…" : "Clear Practice Data"}
        </button>
      </div>
    </section>
  );
}

// Staff (Rishi): Chuck's onboarding checklist, his real use of the portal, and notes from each review meeting.
export default function PartnerOnboarding() {
  const [checks, setChecks] = useState(null);
  const [usage, setUsage] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [staff, setStaff] = useState([]);
  const [f, setF] = useState({ meeting_on: todayISO(), ratings: {}, notes: "", partner_feedback: "", follow_ups: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const sb = getBrowserClient();
    const [{ data: c, error }, { data: fb }, { data: list }] = await Promise.all([
      sb.from("partner_onboarding_checks").select("item_key, done_at, done_by").eq("partner_id", PID),
      sb.from("partner_feedback").select("*").eq("partner_id", PID).order("meeting_on", { ascending: false }),
      sb.rpc("staff_members"),
    ]);
    if (error) setMsg("Run the 0086 SQL to turn this page on.");
    setChecks(new Map((c || []).map((x) => [x.item_key, x])));
    setFeedback(fb || []);
    setStaff(list || []);
    setUsage(await loadUsage(sb));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const nameOf = (id) => staff.find((p) => p.id === id)?.full_name || "";

  async function toggle(key, on) {
    const sb = getBrowserClient();
    if (on) await sb.from("partner_onboarding_checks").insert({ partner_id: PID, item_key: key });
    else await sb.from("partner_onboarding_checks").delete().eq("partner_id", PID).eq("item_key", key);
    load();
  }
  async function saveFeedback(e) {
    e.preventDefault();
    if (!f.notes.trim() && !f.partner_feedback.trim() && !Object.keys(f.ratings).length) return setMsg("Add a rating or a note first.");
    const { error } = await getBrowserClient()
      .from("partner_feedback")
      .insert({ partner_id: PID, meeting_on: f.meeting_on, ratings: f.ratings, notes: f.notes.trim() || null, partner_feedback: f.partner_feedback.trim() || null, follow_ups: f.follow_ups.trim() || null });
    if (error) return setMsg("That didn't save. Try again.");
    setF({ meeting_on: todayISO(), ratings: {}, notes: "", partner_feedback: "", follow_ups: "" });
    setMsg("Saved.");
    load();
  }

  const total = CHECKLIST.reduce((n, d) => n + d.items.length, 0);
  const doneCount = checks ? CHECKLIST.reduce((n, d) => n + d.items.filter(([k]) => checks.has(k)).length, 0) : 0;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Partners</span>
        <h1 className="admin-title">Chuck Onboarding</h1>
        <p className="small">
          Tick each item once Chuck has done it himself. After each meeting, record how he&apos;s doing and what he said. The walkthroughs are in{" "}
          <a href={DOC} target="_blank" rel="noreferrer">
            Rishi&apos;s onboarding doc
          </a>
          .
        </p>
        {msg ? <p className="small">{msg}</p> : null}
      </div>

      <section className="boxed stack">
        <h2 className="sec-title">
          Checklist {checks ? `(${doneCount} of ${total})` : ""}
        </h2>
        {!checks ? (
          <p className="small">Loading…</p>
        ) : (
          CHECKLIST.map((d) => (
            <div key={d.day} className="stack" style={{ gap: 4 }}>
              <b className="small">{d.day}</b>
              {d.note ? <span className="small">{d.note}</span> : null}
              {d.items.map(([k, label, mins]) => {
                const c = checks.get(k);
                return (
                  <label key={k} className="check-line">
                    <input type="checkbox" checked={!!c} onChange={(e) => toggle(k, e.target.checked)} />
                    <span>
                      {label}
                      {mins ? <span className="small"> · ~{mins} min</span> : null}
                      {c ? <span className="small"> · {[nameOf(c.done_by), shortDate(String(c.done_at).slice(0, 10))].filter(Boolean).join(", ")}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          ))
        )}
      </section>

      <section className="boxed stack">
        <h2 className="sec-title">What He&apos;s Actually Using (Last 30 Days)</h2>
        {!usage ? (
          <p className="small">Loading…</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>In the Agent Portal</th>
                <th className="r">Times</th>
                <th>Last</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.label}>
                  <td>{u.label}</td>
                  <td className="r">{u.n}</td>
                  <td>{u.last ? shortDate(String(u.last).slice(0, 10)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <PracticeClear />

      <form className="boxed stack" onSubmit={saveFeedback}>
        <h2 className="sec-title">Meeting Notes and Feedback</h2>
        <label className="stack" style={{ gap: 4, maxWidth: 200 }}>
          <span className="small">Meeting date</span>
          <input type="date" value={f.meeting_on} onChange={(e) => setF((s) => ({ ...s, meeting_on: e.target.value }))} />
        </label>
        <table className="admin-table">
          <thead>
            <tr>
              <th>How he&apos;s doing</th>
              {Object.values(RATINGS).map((r) => (
                <th key={r}>{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AREAS.map(([k, label]) => (
              <tr key={k}>
                <td>{label}</td>
                {Object.keys(RATINGS).map((r) => (
                  <td key={r}>
                    <input type="radio" name={`r-${k}`} aria-label={`${label}: ${RATINGS[r]}`} checked={f.ratings[k] === r} onChange={() => setF((s) => ({ ...s, ratings: { ...s.ratings, [k]: r } }))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <textarea rows={3} placeholder="Your notes: what went well, where he got stuck" value={f.notes} onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))} />
        <textarea rows={3} placeholder="Chuck's feedback, in his words: what's confusing, what he'd change" value={f.partner_feedback} onChange={(e) => setF((s) => ({ ...s, partner_feedback: e.target.value }))} />
        <textarea rows={2} placeholder="Follow-ups for Rosie (things to fix or simplify)" value={f.follow_ups} onChange={(e) => setF((s) => ({ ...s, follow_ups: e.target.value }))} />
        <div className="req-actions">
          <button type="submit" className="btn primary sm">
            Save Notes
          </button>
        </div>
      </form>

      {feedback.length ? (
        <section className="boxed stack">
          <h2 className="sec-title">Past Meetings</h2>
          <ul className="req-list">
            {feedback.map((m) => (
              <li key={m.id} className="req stack">
                <div className="req-top">
                  <b>{shortDate(m.meeting_on)}</b>
                  <span className="small">{nameOf(m.created_by)}</span>
                </div>
                <span className="small">
                  {AREAS.filter(([k]) => m.ratings?.[k])
                    .map(([k, label]) => `${label}: ${RATINGS[m.ratings[k]]}`)
                    .join(" · ")}
                </span>
                {m.notes ? <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}><b>Notes:</b> {m.notes}</p> : null}
                {m.partner_feedback ? <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}><b>Chuck said:</b> {m.partner_feedback}</p> : null}
                {m.follow_ups ? <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}><b>Follow-ups:</b> {m.follow_ups}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
