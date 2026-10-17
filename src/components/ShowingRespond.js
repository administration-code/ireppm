"use client";

import { useMemo, useState } from "react";

const WINDOWS = ["Morning (9 am – 12 pm)", "Afternoon (12 – 5 pm)", "Evening (5 – 8 pm)"];
const START = { Morning: 9, Afternoon: 12, Evening: 17 };

// Day + window choices that start late enough: 24 hours ahead, or later today if vacant.
export function showingSlots(vacant, days = 14) {
  const earliest = Date.now() + (vacant ? 0 : 24 * 3600 * 1000);
  const out = [];
  const today = new Date();
  for (let k = 0; k <= days; k++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + k);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const windows = WINDOWS.filter((w) => {
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), START[w.split(" ")[0]]);
      return start.getTime() >= earliest;
    });
    if (windows.length)
      out.push({ iso, label: d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" }), windows });
  }
  return out;
}

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
      body: JSON.stringify({ token, action, date, time, note, notifyTenants }),
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
              <select id="r-day" value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }}>
                <option value="">Choose a day</option>
                {slots.map((s) => (
                  <option key={s.iso} value={s.iso}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="r-time">Time</label>
              <select id="r-time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!day}>
                <option value="">Choose a time</option>
                {(day?.windows || []).map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <button className="btn primary" type="button" disabled={busy || !date || !time} onClick={() => send("reschedule")}>
              {busy ? "Sending…" : "Send the new time"}
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
