"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { CATEGORY_LABEL, dollars, LINE_STATUS_LABEL, staffMessage } from "@/lib/accounting";
import { shortDate } from "@/lib/rent";
import MatchPanel from "./MatchPanel";

const FILTERS = [
  { key: "attention", label: "Needs attention", test: (l) => l.status === "unmatched" },
  { key: "all", label: "All", test: () => true },
  { key: "in", label: "Money in", test: (l) => Number(l.amount) > 0 },
  { key: "out", label: "Money out", test: (l) => Number(l.amount) < 0 },
  { key: "matched", label: "Matched", test: (l) => l.status === "matched" },
  { key: "categorized", label: "Categorised", test: (l) => l.status === "categorized" },
  { key: "ignored", label: "Ignored", test: (l) => l.status === "ignored" },
];

function Explained({ line, links }) {
  if (line.status === "matched") {
    return (
      <ul className="acct-link-list">
        {links.map((l) => (
          <li key={l.id}>
            <Link href={l.href}>{l.label}</Link>
            {links.length > 1 ? <span className="small num"> {dollars(l.amount)}</span> : null}
          </li>
        ))}
      </ul>
    );
  }
  if (line.status === "categorized") {
    return (
      <span>
        {CATEGORY_LABEL[line.category] || line.category}
        {line.note ? <span className="small"> · {line.note}</span> : null}
      </span>
    );
  }
  if (line.status === "ignored") {
    return <span className="small">Ignored{line.note ? ` · ${line.note}` : ""}</span>;
  }
  return <span className="small">Not explained yet</span>;
}

function CategoriseForm({ line, mode, onDone, onCancel }) {
  const id = useId();
  const [category, setCategory] = useState(line.category || "");
  const [note, setNote] = useState(line.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    if (mode === "categorize" && !category) return setError("Choose what this line was for.");
    if (mode === "ignore" && !note.trim()) return setError("Add a short note saying why it's ignored, like \"duplicate\".");
    setBusy(true);
    setError("");
    const changes =
      mode === "categorize"
        ? { status: "categorized", category, note: note.trim() || null }
        : { status: "ignored", category: null, note: note.trim() };
    const { error: err } = await getBrowserClient().from("bank_transactions").update(changes).eq("id", line.id);
    setBusy(false);
    if (err) return setError(staffMessage(err));
    onDone();
  }

  return (
    <form className="acct-inline-form" onSubmit={save} noValidate>
      {mode === "categorize" ? (
        <div className="field">
          <label htmlFor={`${id}-cat`}>What was it for?</label>
          <select id={`${id}-cat`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose…</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={`${id}-note`}>{mode === "ignore" ? "Why ignore it?" : "Note (optional)"}</label>
        <input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </div>
      <div className="acct-inline-actions">
        <button type="submit" className="btn sm primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn sm ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function LineRow({ line, links, locked, highlighted, onMatch, onChanged }) {
  const [mode, setMode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const out = Number(line.amount) < 0;

  async function undo() {
    setBusy(true);
    setError("");
    const sb = getBrowserClient();
    const { error: err } =
      line.status === "matched"
        ? await sb.from("bank_transaction_links").delete().eq("bank_transaction_id", line.id)
        : await sb.from("bank_transactions").update({ status: "unmatched", category: null, note: null }).eq("id", line.id);
    setBusy(false);
    if (err) return setError(staffMessage(err));
    onChanged();
  }

  return (
    <li id={`bank-line-${line.id}`} className={`acct-line st-${line.status}${highlighted ? " is-highlight" : ""}`}>
      <div className="acct-line-main">
        <span className="acct-line-date">{shortDate(line.posted_on)}</span>
        <span className="acct-line-desc">{line.description || "No description"}</span>
        <span className={`num acct-line-amt${out ? " acct-out" : ""}`}>{dollars(line.amount)}</span>
      </div>
      <div className="acct-line-sub">
        <span className={`pill line-pill st-${line.status}`}>{LINE_STATUS_LABEL[line.status] || line.status}</span>
        <div className="acct-line-explain">
          <Explained line={line} links={links} />
        </div>
        {!locked && !mode ? (
          <div className="row-actions">
            {line.status === "unmatched" ? (
              <>
                <button type="button" className="link-btn" onClick={() => onMatch(line)}>
                  Match
                </button>
                <button type="button" className="link-btn" onClick={() => setMode("categorize")}>
                  Categorise
                </button>
                <button type="button" className="link-btn danger" onClick={() => setMode("ignore")}>
                  Ignore
                </button>
              </>
            ) : (
              <button type="button" className="link-btn danger" disabled={busy} onClick={undo}>
                {line.status === "matched" ? "Unmatch" : "Undo"}
              </button>
            )}
          </div>
        ) : null}
      </div>
      {mode ? (
        <CategoriseForm
          line={line}
          mode={mode}
          onCancel={() => setMode("")}
          onDone={() => (setMode(""), onChanged())}
        />
      ) : null}
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export default function BankLines({ accountId, month, lines, links, locked, highlight, onChanged }) {
  const [filter, setFilter] = useState("attention");
  const [matching, setMatching] = useState(null);

  const highlightLine = highlight ? lines.find((l) => l.id === highlight) : null;
  const chosen = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const active = highlightLine && !chosen.test(highlightLine) ? FILTERS[1] : chosen;
  const shown = lines.filter(active.test);

  return (
    <section className="boxed stack" aria-labelledby="acct-lines-title">
      <div className="req-top">
        <h2 id="acct-lines-title" className="sec-title">
          Bank lines
        </h2>
        <span className="small">{lines.length} this month</span>
      </div>

      <div className="chip-row" role="group" aria-label="Filter bank lines">
        {FILTERS.map((f) => {
          const count = lines.filter(f.test).length;
          return (
            <button
              key={f.key}
              type="button"
              className={`chip${active.key === f.key ? " on" : ""}`}
              aria-pressed={active.key === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label} <span className="chip-count">{count}</span>
            </button>
          );
        })}
      </div>

      {!lines.length ? (
        <p className="small">
          No bank lines for this month yet. <Link href="/admin/accounting/import">Upload the CSV</Link>.
        </p>
      ) : !shown.length ? (
        <p className="small">
          {active.key === "attention" ? "Nothing needs attention. Every line is explained." : "No lines here."}
        </p>
      ) : (
        <ul className="acct-lines">
          {shown.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              links={links[line.id] || []}
              locked={locked}
              highlighted={line.id === highlight}
              onMatch={setMatching}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}

      {matching ? (
        <MatchPanel
          accountId={accountId}
          month={month}
          line={matching}
          onClose={() => setMatching(null)}
          onMatched={() => (setMatching(null), onChanged())}
        />
      ) : null}
    </section>
  );
}
