"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { refreshStaffCounts } from "@/lib/admin-nav";
import {
  applyMapping,
  dollars,
  guessMapping,
  loadAccounts,
  looksHeaderless,
  parseCsv,
  scotiabankMapping,
  staffMessage,
} from "@/lib/accounting";
import { shortDate } from "@/lib/rent";
import AccountingTabs from "./AccountingTabs";
import AccountSetup from "./AccountSetup";

const PREVIEW_ROWS = 10;

const FIELDS = [
  { key: "date", label: "Date", modes: ["single", "split"], required: true },
  { key: "description", label: "Description", modes: ["single", "split"] },
  { key: "extra", label: "Extra details (optional)", modes: ["single", "split"] },
  { key: "amount", label: "Amount", modes: ["single"], required: true },
  { key: "debit", label: "Withdrawals (money out)", modes: ["split"] },
  { key: "credit", label: "Deposits (money in)", modes: ["split"] },
  { key: "balance", label: "Balance (optional)", modes: ["single", "split"] },
];

function mappingFits(saved, rows) {
  if (!saved || typeof saved !== "object" || saved.date == null) return false;
  const width = Math.max(...rows.slice(0, 5).map((r) => r.length));
  return ["date", "amount", "debit", "credit", "description", "balance"].every((k) => (saved[k] ?? -1) < width);
}

function firstGuess(rows, saved) {
  if (mappingFits(saved, rows)) return { ...saved };
  if (looksHeaderless(rows)) return scotiabankMapping(rows);
  return guessMapping(rows[0] || [], rows.slice(1, 21));
}

async function loadHistory(accountId) {
  const { data } = await getBrowserClient()
    .from("bank_imports")
    .select("id, file_name, rows_added, rows_skipped, first_date, last_date, imported_at, who:profiles(full_name, email)")
    .eq("account_id", accountId)
    .order("imported_at", { ascending: false })
    .limit(50);
  return data || [];
}

function ColumnSelect({ id, label, value, columns, onChange }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value ?? -1} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={-1}>Not in this file</option>
        {columns.map((c, i) => (
          <option key={i} value={i}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}

function History({ rows }) {
  if (!rows.length) return <p className="small">No files imported yet.</p>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">File</th>
            <th scope="col">Dates</th>
            <th scope="col" className="num">Added</th>
            <th scope="col" className="num">Skipped</th>
            <th scope="col">Who</th>
            <th scope="col">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.file_name || "Bank file"}</td>
              <td>
                {r.first_date ? `${shortDate(r.first_date)} – ${shortDate(r.last_date)}` : "—"}
              </td>
              <td className="num">{r.rows_added}</td>
              <td className="num">{r.rows_skipped}</td>
              <td>{r.who?.full_name || r.who?.email || "—"}</td>
              <td>{new Date(r.imported_at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ImportBoard() {
  const id = useId();
  const [accounts, setAccounts] = useState(null);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const refreshAccounts = useCallback(async () => {
    try {
      const list = await loadAccounts();
      setAccounts(list);
      setAccountId((cur) => (list.some((a) => a.id === cur) ? cur : list[0]?.id || ""));
    } catch (err) {
      setError(err.message);
      setAccounts([]);
    }
  }, []);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    if (accountId) loadHistory(accountId).then(setHistory);
  }, [accountId]);

  const account = accounts?.find((a) => a.id === accountId);

  async function readFile(f) {
    setError("");
    setResult(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type && !/csv|text|excel/i.test(f.type)) {
      setError("That isn't a CSV file. Download the statement from the bank as CSV and try again.");
      return;
    }
    const parsed = parseCsv(await f.text());
    if (!parsed.length) {
      setError("That file is empty.");
      return;
    }
    setFile(f);
    setRows(parsed);
    setMapping(firstGuess(parsed, account?.csv_mapping));
  }

  function reset() {
    setFile(null);
    setRows([]);
    setMapping(null);
  }

  function setField(key, value) {
    setMapping((m) => {
      const next = { ...m, [key]: value };
      if (key === "date") next.dateOrder = null;
      return next;
    });
  }

  function toggleHeader(noHeader) {
    setMapping(noHeader ? scotiabankMapping(rows) : guessMapping(rows[0], rows.slice(1, 21)));
  }

  const columns = mapping
    ? (mapping.hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`)).map((c, i) =>
        mapping.hasHeader ? `${c || `Column ${i + 1}`}` : `Column ${i + 1} (e.g. ${rows[0][i] || "blank"})`
      )
    : [];

  const bodyDates = mapping && mapping.date >= 0 ? (mapping.hasHeader ? rows.slice(1) : rows).map((r) => r[mapping.date]) : [];
  const dateNeedsOrder =
    mapping && mapping.date >= 0 && !mapping.dateOrder && bodyDates.some((d) => /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(String(d).trim()));

  const parsed = mapping && !dateNeedsOrder ? applyMapping(rows, mapping) : [];
  const good = parsed.filter((r) => !r.problem);
  const bad = parsed.filter((r) => r.problem);
  const amountMissing = mapping && (mapping.mode === "split" ? mapping.debit < 0 && mapping.credit < 0 : mapping.amount < 0);

  async function runImport() {
    if (!good.length) return;
    setBusy(true);
    setError("");
    const sb = getBrowserClient();
    const payload = good.map(({ posted_on, description, amount, running_balance }) => ({
      posted_on,
      description,
      amount,
      running_balance,
    }));
    const { data, error: err } = await sb.rpc("import_bank_rows", {
      p_account_id: accountId,
      p_file_name: file?.name || "bank.csv",
      p_rows: payload,
    });
    if (err) {
      setBusy(false);
      setError(staffMessage(err, "The import didn't go through. Check the columns and try again."));
      return;
    }
    await sb.from("bank_accounts").update({ csv_mapping: mapping }).eq("id", accountId);
    const months = [...new Set(good.map((r) => r.posted_on.slice(0, 7)))].sort();
    setResult({ ...data, month: months[months.length - 1] });
    setBusy(false);
    reset();
    refreshAccounts();
    loadHistory(accountId).then(setHistory);
    refreshStaffCounts();
  }

  if (accounts === null) {
    return (
      <div className="stack">
        <AccountingTabs title="Bank imports" />
        <p className="small">Loading…</p>
      </div>
    );
  }

  if (!accounts.length) {
    return (
      <div className="stack">
        <AccountingTabs title="Bank imports" />
        {error ? <div className="warnbox">{error}</div> : null}
        <AccountSetup onSaved={refreshAccounts} />
      </div>
    );
  }

  return (
    <div className="stack">
      <AccountingTabs title="Bank imports" subtitle="Upload the CSV your bank gives you. Lines already imported are skipped." />

      {result ? (
        <div className="okbox" role="status">
          Added {result.added} line{result.added === 1 ? "" : "s"}, skipped {result.skipped} already imported, auto-matched{" "}
          {result.matched}.{" "}
          {result.month ? (
            <Link href={`/admin/accounting?month=${result.month}${accounts.length > 1 ? `&account=${accountId}` : ""}`}>
              Reconcile that month
            </Link>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}

      <section className="boxed stack" aria-labelledby={`${id}-upload`}>
        <h2 id={`${id}-upload`} className="sec-title">
          Upload a statement
        </h2>

        {accounts.length > 1 ? (
          <div className="field">
            <label htmlFor={`${id}-acct`}>Bank account</label>
            <select
              id={`${id}-acct`}
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                reset();
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.account_last4 ? ` ····${a.account_last4}` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="small">
            Into <strong>{account?.name}</strong>
            {account?.account_last4 ? ` ····${account.account_last4}` : ""}
          </p>
        )}

        <label
          htmlFor={`${id}-file`}
          className={`acct-drop${dragging ? " is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            readFile(e.dataTransfer.files?.[0]);
          }}
        >
          <span className="acct-drop-title">{file ? file.name : "Drop a CSV file here, or click to choose one"}</span>
          <span className="small">
            {file ? `${rows.length} rows read` : "From your bank's website: download transactions as CSV."}
          </span>
          <input
            id={`${id}-file`}
            type="file"
            accept=".csv,text/csv"
            className="visually-hidden"
            onChange={(e) => {
              readFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        {mapping ? (
          <div className="stack">
            <h3 className="sub-title">Which column is which?</h3>
            {account?.csv_mapping && mappingFits(account.csv_mapping, rows) ? (
              <p className="small">Using the columns you picked last time for this account.</p>
            ) : null}

            <label className="check">
              <input type="checkbox" checked={!mapping.hasHeader} onChange={(e) => toggleHeader(e.target.checked)} />
              <span>No header row (the first row is already a transaction, like Scotiabank files)</span>
            </label>

            <fieldset className="acct-radio">
              <legend>How does the file show amounts?</legend>
              <label className="check">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  checked={mapping.mode === "single"}
                  onChange={() => setMapping((m) => ({ ...m, mode: "single" }))}
                />
                <span>One amount column (money out is negative)</span>
              </label>
              <label className="check">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  checked={mapping.mode === "split"}
                  onChange={() => setMapping((m) => ({ ...m, mode: "split" }))}
                />
                <span>Separate withdrawal and deposit columns</span>
              </label>
            </fieldset>

            <div className="acct-map-grid">
              {FIELDS.filter((f) => f.modes.includes(mapping.mode)).map((f) => (
                <ColumnSelect
                  key={f.key}
                  id={`${id}-${f.key}`}
                  label={f.label}
                  value={mapping[f.key]}
                  columns={columns}
                  onChange={(v) => setField(f.key, v)}
                />
              ))}
            </div>

            {dateNeedsOrder ? (
              <div className="field acct-ask">
                <label htmlFor={`${id}-order`}>
                  We can&apos;t tell how the dates are written (e.g. {bodyDates.find(Boolean)}). Which is it?
                </label>
                <select
                  id={`${id}-order`}
                  value=""
                  onChange={(e) => setMapping((m) => ({ ...m, dateOrder: e.target.value }))}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  <option value="mdy">Month / day / year (10/03/2026 is Oct 3)</option>
                  <option value="dmy">Day / month / year (10/03/2026 is Mar 10)</option>
                </select>
              </div>
            ) : null}

            {mapping.date < 0 ? <div className="warnbox">Pick the date column.</div> : null}
            {amountMissing ? <div className="warnbox">Pick the amount column.</div> : null}

            {parsed.length ? (
              <>
                <h3 className="sub-title">
                  Preview (first {Math.min(PREVIEW_ROWS, parsed.length)} of {parsed.length})
                </h3>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Description</th>
                        <th scope="col" className="num">Amount</th>
                        <th scope="col" className="num">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.slice(0, PREVIEW_ROWS).map((r) => (
                        <tr key={r.index} className={r.problem ? "acct-row-bad" : undefined}>
                          <td>{r.posted_on ? shortDate(r.posted_on) : <span className="acct-out">Can&apos;t read date</span>}</td>
                          <td>{r.description || "—"}</td>
                          <td className={`num${r.amount < 0 ? " acct-out" : ""}`}>
                            {r.amount == null ? <span className="acct-out">Can&apos;t read amount</span> : dollars(r.amount)}
                          </td>
                          <td className="num">{r.running_balance == null ? "" : dollars(r.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {bad.length ? (
                  <p className="small">
                    {bad.length} row{bad.length === 1 ? "" : "s"} can&apos;t be read and will be left out (rows{" "}
                    {bad
                      .slice(0, 8)
                      .map((r) => r.index + (mapping.hasHeader ? 2 : 1))
                      .join(", ")}
                    {bad.length > 8 ? "…" : ""}).
                  </p>
                ) : null}
              </>
            ) : null}

            <div className="row-actions">
              <button type="button" className="btn" disabled={busy || !good.length} onClick={runImport}>
                {busy ? "Importing…" : `Import ${good.length} line${good.length === 1 ? "" : "s"}`}
              </button>
              <button type="button" className="btn ghost" disabled={busy} onClick={reset}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="boxed stack" aria-labelledby={`${id}-history`}>
        <h2 id={`${id}-history`} className="sec-title">
          Past imports
        </h2>
        <History rows={history} />
      </section>
    </div>
  );
}
