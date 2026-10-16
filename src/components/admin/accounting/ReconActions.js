"use client";

import { useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { staffMessage } from "@/lib/accounting";
import { cents } from "@/lib/rent";

export default function ReconActions({ accountId, month, summary, rec, isAdmin, onChanged }) {
  const id = useId();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const status = summary.status || "open";
  const locked = status === "locked";
  const needsNote = cents(summary.three_way_difference) !== 0 && !rec?.notes && !notes.trim();

  async function run(action) {
    if (action === "unlock" && !notes.trim()) return setError("Add a note saying why the month is being unlocked.");
    if (action === "lock" && !window.confirm("Lock this month? Its bank lines, payments and payouts can't be changed until an admin unlocks it.")) return;
    setBusy(action);
    setError("");
    setDone("");
    const { error: err } = await getBrowserClient().rpc("set_reconciliation", {
      p_account_id: accountId,
      p_period: `${month}-01`,
      p_statement_closing: null,
      p_action: action,
      p_notes: notes.trim() || null,
    });
    setBusy("");
    if (err) return setError(staffMessage(err));
    setNotes("");
    setDone(
      { save: "Notes saved.", balance: "Marked balanced.", lock: "Month locked.", unlock: "Month unlocked." }[action]
    );
    onChanged();
  }

  return (
    <section className="boxed stack no-print" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="sec-title">
        Finish the month
      </h2>

      {rec?.notes ? (
        <div className="stack-sm">
          <h3 className="sub-title">Notes</h3>
          <p className="acct-notes">{rec.notes}</p>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor={`${id}-notes`}>
          {locked ? "Reason for unlocking" : rec?.notes ? "Add to the notes" : "Notes for this month"}
        </label>
        <textarea
          id={`${id}-notes`}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            locked
              ? "e.g. bank reversed a cheque on the 14th"
              : "Anything the accountant should know, like why the books differ from the bank"
          }
        />
        {!locked && needsNote ? (
          <p className="small">The bank and the books don&apos;t agree, so a note is needed before you can mark this balanced.</p>
        ) : null}
      </div>

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="small" role="status">
          {done}
        </p>
      ) : null}

      <div className="acct-inline-actions">
        {locked ? (
          isAdmin ? (
            <button type="button" className="btn" disabled={!!busy} onClick={() => run("unlock")}>
              {busy === "unlock" ? "Unlocking…" : "Unlock month"}
            </button>
          ) : (
            <p className="small">Only an admin can unlock a month.</p>
          )
        ) : (
          <>
            <button type="button" className="btn ghost" disabled={!!busy || !notes.trim()} onClick={() => run("save")}>
              {busy === "save" ? "Saving…" : "Save notes"}
            </button>
            {status !== "balanced" ? (
              <button type="button" className="btn" disabled={!!busy} onClick={() => run("balance")}>
                {busy === "balance" ? "Checking…" : "Mark balanced"}
              </button>
            ) : null}
            <button type="button" className="btn primary" disabled={!!busy} onClick={() => run("lock")}>
              {busy === "lock" ? "Locking…" : "Lock month"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
