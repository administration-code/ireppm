"use client";

import { useMemo, useState } from "react";
import { showingSlots } from "@/lib/showing-times";

export { showingSlots };

const DONE = {
  confirmed: "Approved. The renter has been emailed",
  declined: "Declined. The renter has been emailed.",
  rescheduled: "New time sent. The renter will accept or decline it in their account, and you'll get an email.",
};

export default function ShowingRespond({ token, status, vacant, tenantCount, proposed }) {
  const slots = useMemo(() => showingSlots(vacant), [vacant]);
  const [mode, setMode] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [exact, setExact] = useState("");
  const [note, setNote] = useState("");
  const [notifyTenants, setNotifyTenants] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const day = slots.find((s) => s.iso === date);

  async function send(action) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/showings/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action, date, time: exact || time, note, notifyTenants }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error || "That didn't save. Try again.");
    setResult(json);
  }

  if (result) {
    const extra =
      result.status === "confirmed"
        ? result.tenantsNotified
          ? `, and ${result.tenantsNotified} tenant${result.tenantsNotified === 1 ? " was" : "s were"} sent written notice.`
          : "."
        : "";
    return <div className="okbox">{DONE[result.status] + extra}</div>;
  }
  if (["declined", "cancelled", "completed"].includes(status)) {
    return <div className="okbox">This showing is {status}. Nothing more to do.</div>;
  }

  return (
    <div className="stack">
      {status === "confirmed" ? <div className="okbox">Already approved. You can still suggest a new time or decline it.</div> : null}
      {status === "rescheduled" ? <div className="okbox">Waiting for the renter to answer the time you suggested: {proposed}.</div> : null}
      <div className="field">
        <label htmlFor="r-note">Note to the renter (optional)</label>
        <textarea id="r-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please park on the street." />
      </div>

      {mode === "reschedule" ? (
        <div className="boxed stack">
          <p className="small">
            {vacant ? "The unit is vacant, so later today works." : "The unit is occupied, so the new time must be at least 24 hours away."}
          </p>
          <div className="row2">
            <div className="field">
              <label htmlFor="r-day">Day</label>
              <select id="r-day" value={date} onChange={(e) => { setDate(e.target.value); setTime(""); setExact(""); }}>
                <option value="">Choose a day</option>
                {slots.map((s) => (
                  <option key={s.iso} value={s.iso}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="r-time">Time of Day</label>
              <select id="r-time" value={time} onChange={(e) => { const w = e.target.value; const d = day; setTime(w); setExact(w && d && !d.whole?.[w] ? d.times[w][0] : ""); }} disabled={!day}>
                <option value="">Choose a time</option>
                {(day?.windows || []).map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="r-exact">Exact Time</label>
            <select id="r-exact" value={exact} onChange={(e) => setExact(e.target.value)} disabled={!time}>
              {(day)?.whole?.[time] !== false ? <option value="">Any time in this window</option> : null}
              {(day?.times?.[time] || []).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <span className="small">Pick a 30-minute start time, or leave it as any time in the window.</span>
          </div>
          <div className="row">
            <button className="btn primary" type="button" disabled={busy || !date || !time} onClick={() => send("reschedule")}>
              {busy ? "Sending…" : "Send the New Time"}
            </button>
            <button className="btn ghost" type="button" onClick={() => setMode("")}>Back</button>
          </div>
        </div>
      ) : (
        <>
          {!vacant && tenantCount ? (
            <label className="check">
              <input type="checkbox" checked={notifyTenants} onChange={(e) => setNotifyTenants(e.target.checked)} />
              Email the current tenants the written 24-hour notice of entry when I approve
            </label>
          ) : null}
          <div className="row">
            {status !== "confirmed" ? (
              <button className="btn primary" type="button" disabled={busy} onClick={() => send("approve")}>
                {busy ? "Saving…" : "Approve"}
              </button>
            ) : null}
            <button className="btn ghost" type="button" disabled={busy} onClick={() => setMode("reschedule")}>
              Suggest another time
            </button>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => send("decline")}>
              Decline
            </button>
          </div>
        </>
      )}
      {error ? <div className="warnbox" role="alert">{error}</div> : null}
    </div>
  );
}
