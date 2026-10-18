"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import { showingSlots } from "./ShowingRespond";
import ShowingAnswer from "./ShowingAnswer";

const OPEN_STATUSES = ["submitted", "reviewing", "approved"];


function prettyDate(iso) {
  const x = new Date(iso + "T12:00:00");
  return x.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });
}

export default function ListingActions({ listing, sample }) {
  const router = useRouter();
  const { user, ready, configured, openSignIn } = useAuth();
  const [vacant, setVacant] = useState(false);
  const days = useMemo(() => showingSlots(vacant, 10), [vacant]);
  const [showing, setShowing] = useState(null);
  const [lastApp, setLastApp] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [date, setDate] = useState("");
  const [win, setWin] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const live = configured && !sample;
  const here = `/properties/${listing.slug}`;

  // Load this renter's existing showing and application for the listing.
  useEffect(() => {
    if (!live || !user) return;
    const sb = getBrowserClient();
    sb.from("showing_requests")
      .select("id, preferred_date, preferred_time, status, proposed_date, proposed_time, staff_note")
      .eq("listing_id", listing.id)
      .eq("user_id", user.id)
      .in("status", ["requested", "confirmed", "rescheduled"])
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => setShowing(data && data[0] ? data[0] : null));
    sb.from("applications")
      .select("id, status")
      .eq("listing_id", listing.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => setLastApp(data && data[0] ? data[0] : null));
  }, [live, user, listing.id]);

  // Vacant units can be shown the same day; occupied ones need 24 hours' notice.
  useEffect(() => {
    if (!live) return;
    getBrowserClient()
      .rpc("listing_is_vacant", { p_listing_id: listing.id })
      .then(({ data }) => setVacant(Boolean(data)));
  }, [live, listing.id]);

  // Coming back from the sign-in email with ?action=book opens the showing form.
  useEffect(() => {
    if (!ready || !user) return;
    if (new URLSearchParams(window.location.search).get("action") === "book") {
      setFormOpen(true);
      window.history.replaceState(null, "", here);
    }
  }, [ready, user, here]);

  function book() {
    if (!live) return openSignIn(here);
    if (!user) return openSignIn(`${here}?action=book`);
    setFormOpen(true);
  }

  function apply() {
    const dest = `/account?apply=${encodeURIComponent(listing.id)}`;
    if (!live) return openSignIn(here);
    if (!user) return openSignIn(dest);
    router.push(dest);
  }

  async function submitShowing(e) {
    e.preventDefault();
    setError("");
    if (!date) return setError("Pick a day for the showing.");
    if (!win) return setError("Pick a time of day.");
    setBusy(true);
    const sb = getBrowserClient();
    const { data, error: err } = await sb
      .from("showing_requests")
      .insert({ listing_id: listing.id, user_id: user.id, preferred_date: date, preferred_time: win, notes: notes.trim() || null })
      .select("id, preferred_date, preferred_time, status, proposed_date, proposed_time, staff_note")
      .single();
    setBusy(false);
    if (err) return setError(/24 hours/.test(err.message) ? err.message : "We couldn't save your request. Try again in a moment.");
    setShowing(data);
    setFormOpen(false);
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {showing ? (
        showing.status === "rescheduled" ? (
          <ShowingAnswer showing={showing} onDone={(status) => setShowing(status === "confirmed" ? { ...showing, status, preferred_date: showing.proposed_date, preferred_time: showing.proposed_time } : null)} />
        ) : (
          <div className="okbox">
            {showing.status === "confirmed" ? "Showing confirmed for " : "Showing requested for "}
            {prettyDate(showing.preferred_date)}, {showing.preferred_time.toLowerCase()}.
            {showing.status === "confirmed" ? " See you then." : " We'll confirm the time by email."}
          </div>
        )
      ) : formOpen ? (
        <form className="stack" style={{ gap: 12 }} onSubmit={submitShowing}>
          <div className="field">
            <label htmlFor="s-date">Day</label>
            <select id="s-date" value={date} onChange={(e) => { setDate(e.target.value); setWin(""); }} required>
              <option value="">Choose a day</option>
              {days.map((d) => (
                <option key={d.iso} value={d.iso}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-win">Time of day</label>
            <select id="s-win" value={win} onChange={(e) => setWin(e.target.value)} disabled={!date}>
              <option value="">Choose a time</option>
              {(days.find((d) => d.iso === date)?.windows || []).map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
            <span className="small">
              {vacant
                ? "This rental is empty, so same-day showings are possible."
                : "Someone lives here now, so showings are booked at least 24 hours ahead to give them notice."}
            </span>
          </div>
          <div className="field">
            <label htmlFor="s-notes">Anything we should know? (optional)</label>
            <textarea id="s-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. moving in with one roommate" />
          </div>
          {error ? <p className="err">{error}</p> : null}
          <div className="row">
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Request showing"}
            </button>
            <button className="btn ghost" type="button" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="btn primary" onClick={book}>
          Book a Showing
        </button>
      )}
      {lastApp && OPEN_STATUSES.includes(lastApp.status) ? (
        <div className="okbox">
          Application submitted. <Link href="/account">See it in your account</Link>.
        </div>
      ) : (
        <button className="btn ghost" onClick={apply}>
          {lastApp ? "Apply again" : "Apply for this rental"}
        </button>
      )}
      <p className="small">
        Booking a showing only needs your email and phone number. To apply, add your documents to your profile once
        and they attach to every application.
      </p>
    </div>
  );
}
