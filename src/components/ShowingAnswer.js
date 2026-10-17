"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

function prettyDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });
}

// The renter accepts or declines the time IRep suggested.
export default function ShowingAnswer({ showing, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function answer(accept) {
    setBusy(true);
    setError("");
    const { data } = await getBrowserClient().auth.getSession();
    const res = await fetch("/api/showings/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
      body: JSON.stringify({ id: showing.id, accept }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error || "That didn't save. Try again.");
    onDone?.(json.status);
  }

  return (
    <div className="okbox stack" style={{ gap: 8 }}>
      <p style={{ margin: 0 }}>
        We can&apos;t make the time you asked for. Could you come on <b>{prettyDate(showing.proposed_date)}</b>,{" "}
        {String(showing.proposed_time || "").toLowerCase()}?
      </p>
      {showing.staff_note ? <p className="small" style={{ margin: 0 }}>Note from IRep: {showing.staff_note}</p> : null}
      <div className="row">
        <button className="btn primary sm" type="button" disabled={busy} onClick={() => answer(true)}>
          {busy ? "Saving…" : "Accept the new time"}
        </button>
        <button className="btn ghost sm" type="button" disabled={busy} onClick={() => answer(false)}>
          Decline
        </button>
      </div>
      {error ? <p className="err" role="alert">{error}</p> : null}
    </div>
  );
}
