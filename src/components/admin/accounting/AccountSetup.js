"use client";

import { useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { parseAmount, staffMessage } from "@/lib/accounting";
import { todayISO } from "@/lib/rent";

const KINDS = [
  ["trust", "Trust (rent) account"],
  ["operating", "Operating account"],
  ["other", "Other"],
];

export default function AccountSetup({ onSaved }) {
  const id = useId();
  const [form, setForm] = useState({
    name: "Rent trust account",
    institution: "Scotiabank",
    account_last4: "",
    kind: "trust",
    opening_date: `${todayISO().slice(0, 7)}-01`,
    opening_balance: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const balance = parseAmount(form.opening_balance);
    if (!form.name.trim()) return setError("Give the account a name.");
    if (form.account_last4 && !/^\d{4}$/.test(form.account_last4)) return setError("The last 4 digits should be 4 numbers.");
    if (!form.opening_date) return setError("Choose the start date.");
    if (balance == null) return setError("Enter the opening balance from the bank statement, like 12,345.67.");
    setBusy(true);
    setError("");
    const { error: err } = await getBrowserClient()
      .from("bank_accounts")
      .insert({
        name: form.name.trim(),
        institution: form.institution.trim() || null,
        account_last4: form.account_last4 || null,
        kind: form.kind,
        opening_date: form.opening_date,
        opening_balance: balance,
      });
    setBusy(false);
    if (err) return setError(staffMessage(err, "That account didn't save. Try again."));
    onSaved();
  }

  return (
    <section className="boxed stack acct-setup" aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`} className="sec-title">
          Set Up the Bank Account
        </h2>
        <p className="small">
          Pick the first day you want to reconcile, and enter the bank balance at the start of that day from the
          statement. Every month after that builds on it.
        </p>
      </div>
      <form className="stack" onSubmit={save} noValidate>
        <div className="row2">
          <div className="field">
            <label htmlFor={`${id}-name`}>Account name</label>
            <input id={`${id}-name`} value={form.name} onChange={set("name")} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-inst`}>Bank</label>
            <input id={`${id}-inst`} value={form.institution} onChange={set("institution")} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-last4`}>Last 4 digits of the account</label>
            <input
              id={`${id}-last4`}
              inputMode="numeric"
              maxLength={4}
              value={form.account_last4}
              onChange={(e) => setForm((f) => ({ ...f, account_last4: e.target.value.replace(/\D/g, "") }))}
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-kind`}>Kind</label>
            <select id={`${id}-kind`} value={form.kind} onChange={set("kind")}>
              {KINDS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-date`}>Start date</label>
            <input id={`${id}-date`} type="date" value={form.opening_date} onChange={set("opening_date")} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-bal`}>Opening balance ($)</label>
            <input id={`${id}-bal`} inputMode="decimal" value={form.opening_balance} onChange={set("opening_balance")} />
          </div>
        </div>
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <div>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save account"}
          </button>
        </div>
      </form>
    </section>
  );
}
