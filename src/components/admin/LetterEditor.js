"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { monthLabel, shortDate } from "@/lib/rent";
import { LETTER_SELECT } from "@/lib/letters";
import { sendLetters, sendSummary } from "@/lib/send-letters";
import OwnerLetter, { PrintButton } from "@/components/OwnerLetter";

async function loadLetter(id) {
  const { data, error } = await getBrowserClient()
    .from("owner_letters")
    .select(`${LETTER_SELECT}, owner:owners(id, name, email)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export default function LetterEditor({ id }) {
  const [state, setState] = useState({ loading: true, letter: null, error: "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ ok: false, text: "" });

  const apply = useCallback((letter) => {
    setState({ loading: false, letter, error: "" });
    setNote(letter?.staff_note || "");
  }, []);

  useEffect(() => {
    let alive = true;
    loadLetter(id).then(
      (letter) => alive && apply(letter),
      () => alive && setState({ loading: false, letter: null, error: "We couldn't load this letter. Refresh the page to try again." })
    );
    return () => {
      alive = false;
    };
  }, [id, apply]);

  const { loading, letter, error } = state;
  if (loading) return <p className="small">Loading letter…</p>;
  if (!letter) {
    return (
      <div className="empty">
        <h2>{error ? "Something went wrong" : "Letter not found"}</h2>
        <p>{error || "It may have been removed."}</p>
        <Link className="btn ghost" href="/admin/letters">
          Back to Letters
        </Link>
      </div>
    );
  }

  const month = String(letter.period).slice(0, 7);
  const isDraft = letter.status === "draft";
  const email = letter.owner?.email;
  const noteChanged = (letter.staff_note || "") !== note;

  async function run(kind, fn) {
    setBusy(kind);
    setMsg({ ok: false, text: "" });
    try {
      const text = await fn();
      apply(await loadLetter(id));
      if (text) setMsg({ ok: true, text });
    } catch (err) {
      setMsg({ ok: false, text: err.message || "That didn't work. Try again." });
    }
    setBusy("");
  }

  const saveNote = () =>
    run("note", async () => {
      const { data, error: err } = await getBrowserClient()
        .from("owner_letters")
        .update({ staff_note: note.trim() || null })
        .eq("id", id)
        .eq("status", "draft")
        .select("id");
      if (err || !data?.length) throw new Error("The note didn't save. Try again.");
      return "Note saved.";
    });

  const refresh = () =>
    run("refresh", async () => {
      if (noteChanged) throw new Error("Save or undo your note change first.");
      const { error: err } = await getBrowserClient().rpc("draft_owner_letters", { p_period: letter.period });
      if (err) throw new Error("We couldn't refresh the numbers. Try again.");
      return "Updated with the latest numbers.";
    });

  const send = () =>
    run("send", async () => {
      if (noteChanged) throw new Error("Save your note before sending.");
      if (!window.confirm(`Send this ${monthLabel(letter.period)} statement to ${email}?`)) return "";
      const result = await sendLetters([id]);
      if (!result.sent?.length) throw new Error(sendSummary(result));
      return `Sent to ${email}.`;
    });

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="receipt-tools no-print stack">
        <Link className="back" href={`/admin/letters?month=${month}`}>
          ← Landlord letters
        </Link>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8 }}>
            <span className="eyebrow">Staff · Letter</span>
            <h1 className="admin-title">
              {letter.owner?.name || "Owner"} — {monthLabel(letter.period)}
            </h1>
            <p className="small">
              {isDraft
                ? email
                  ? `Draft. Will be sent to ${email}.`
                  : "Draft. No email on file for this owner, so it can't be sent. Add one on the owner page."
                : `Sent to ${letter.sent_to} on ${shortDate(new Date(letter.sent_at).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }))}.`}
            </p>
          </div>
          {letter.owner ? (
            <Link className="btn ghost sm" href={`/admin/owners/${letter.owner.id}`}>
              Owner Details
            </Link>
          ) : null}
        </div>

        {isDraft ? (
          <div className="field">
            <label htmlFor="letter-note">Note to the owner (optional)</label>
            <textarea
              id="letter-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby="letter-note-hint"
            />
            <span className="small" id="letter-note-hint">
              Shown as a short paragraph at the top of the letter and in the email.
            </span>
          </div>
        ) : null}

        <div className="req-actions">
          <PrintButton />
          {isDraft ? (
            <>
              <button type="button" className="btn ghost sm" onClick={saveNote} disabled={Boolean(busy) || !noteChanged}>
                {busy === "note" ? "Saving…" : "Save note"}
              </button>
              <button type="button" className="btn ghost sm" onClick={refresh} disabled={Boolean(busy)}>
                {busy === "refresh" ? "Refreshing…" : "Refresh with latest numbers"}
              </button>
              {email ? (
                <button type="button" className="btn primary sm" onClick={send} disabled={Boolean(busy)}>
                  {busy === "send" ? "Sending…" : `Send to ${email}`}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        {msg.text ? (
          <div className={msg.ok ? "okbox" : "warnbox"} role="status">
            {msg.text}
          </div>
        ) : null}
      </div>

      <OwnerLetter letter={{ ...letter, staff_note: isDraft ? note : letter.staff_note }} />
    </div>
  );
}
