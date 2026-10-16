"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

function DeleteDialog({ summary, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const reasonRef = useRef(null);
  const titleId = useId();
  const reasonId = useId();

  useEffect(() => {
    reasonRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await onConfirm(reason);
  }

  return createPortal(
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
        <h2 id={titleId} className="sub-title del-title">
          Delete {summary}? This can&apos;t be undone.
        </h2>
        <div className="field">
          <label htmlFor={reasonId}>
            Reason <span className="small">(optional)</span>
          </label>
          <input
            id={reasonId}
            ref={reasonRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Test entry, spam, duplicate…"
            maxLength={300}
          />
        </div>
        <div className="req-actions">
          <button type="submit" className="btn primary sm" disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button type="button" className="btn ghost sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

// `run(reason)` performs the delete and throws with a message on failure.
export default function DeleteRecord({ summary, run, onDeleted, className = "" }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function confirm(reason) {
    try {
      await run(reason);
      setOpen(false);
      onDeleted?.();
    } catch (err) {
      setOpen(false);
      setError(err.message || "That didn't delete. Try again.");
    }
  }

  return (
    <>
      <button
        type="button"
        className={`link-btn danger small ${className}`.trim()}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Delete<span className="visually-hidden"> {summary}</span>
      </button>
      {error ? (
        <span className="small err del-err" role="alert">
          {error}
        </span>
      ) : null}
      {open ? <DeleteDialog summary={summary} onConfirm={confirm} onCancel={() => setOpen(false)} /> : null}
    </>
  );
}
