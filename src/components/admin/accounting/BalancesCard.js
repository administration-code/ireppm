"use client";

import { useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { dollars, parseAmount, staffMessage } from "@/lib/accounting";
import { cents } from "@/lib/rent";

export default function BalancesCard({ accountId, month, summary, locked, onSaved }) {
  const id = useId();
  const [value, setValue] = useState(summary.statement_closing == null ? "" : Number(summary.statement_closing).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const diff = summary.statement_difference;
  const unchanged =
    (value === "" && summary.statement_closing == null) ||
    (value !== "" && cents(parseAmount(value)) === cents(summary.statement_closing));

  async function save(e) {
    e.preventDefault();
    const amount = value.trim() === "" ? null : parseAmount(value);
    if (value.trim() !== "" && amount == null) return setError("Enter the closing balance as a number, like 12,345.67.");
    setBusy(true);
    setError("");
    setSaved(false);
    const { error: err } = await getBrowserClient().rpc("set_reconciliation", {
      p_account_id: accountId,
      p_period: `${month}-01`,
      p_statement_closing: amount,
      p_action: "save",
      p_notes: null,
    });
    setBusy(false);
    if (err) return setError(staffMessage(err));
    setSaved(true);
    onSaved();
  }

  return (
    <section className="boxed stack" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="sec-title">
        Bank Statement
      </h2>
      <dl className="acct-balances">
        <div>
          <dt>Opening</dt>
          <dd className="num">{dollars(summary.opening)}</dd>
        </div>
        <div>
          <dt>+ Money in</dt>
          <dd className="num">{dollars(summary.money_in)}</dd>
        </div>
        <div>
          <dt>− Money out</dt>
          <dd className="num acct-out">{dollars(-Number(summary.money_out || 0))}</dd>
        </div>
        <div>
          <dt>= Calculated closing</dt>
          <dd className="num">{dollars(summary.closing_calculated)}</dd>
        </div>
      </dl>

      <form className="acct-statement" onSubmit={save} noValidate>
        <div className="field">
          <label htmlFor={`${id}-stmt`}>Closing balance on your bank statement ($)</label>
          <input
            id={`${id}-stmt`}
            inputMode="decimal"
            value={value}
            disabled={locked}
            onChange={(e) => (setValue(e.target.value), setSaved(false))}
            placeholder="Type it from the statement"
          />
        </div>
        {!locked ? (
          <button type="submit" className="btn sm" disabled={busy || unchanged}>
            {busy ? "Saving…" : "Save"}
          </button>
        ) : null}
        {diff != null ? (
          <p className={`acct-diff${cents(diff) === 0 ? " ok" : " bad"}`}>
            {cents(diff) === 0
              ? "Matches the statement"
              : `Off by ${dollars(Math.abs(diff))}: a bank line is missing or extra`}
          </p>
        ) : null}
      </form>
      {saved ? <p className="small" role="status">Saved.</p> : null}
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
