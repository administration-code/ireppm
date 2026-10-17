"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import {
  CATEGORY_LABEL,
  LINE_STATUS_LABEL,
  RECON_STATUS_LABEL,
  YEAR_BUCKET_LABEL,
  dollars,
  downloadCsv,
  loadIsAdmin,
  loadLinks,
  monthOnly,
  staffMessage,
} from "@/lib/accounting";
import { todayISO } from "@/lib/rent";
import AccountingTabs from "./AccountingTabs";

const sum = (list, key) => list.reduce((t, r) => t + Number(r[key] || 0), 0);
const money = (n) => Number(n || 0).toFixed(2);

export async function loadYear(year) {
  const sb = getBrowserClient();
  const [{ data, error }, { data: close }] = await Promise.all([
    sb.rpc("fiscal_year_summary", { p_year: year }),
    sb.from("fiscal_year_closes").select("closed_at, notes, who:profiles(full_name, email)").eq("year", year).maybeSingle(),
  ]);
  if (error) throw new Error(staffMessage(error, "We couldn't load that year. Refresh the page to try again."));
  return { ...data, close };
}

async function loadYearLines(year) {
  const sb = getBrowserClient();
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("bank_transactions")
      .select("id, posted_on, description, amount, status, category, note, account:bank_accounts(name)")
      .gte("posted_on", `${year}-01-01`)
      .lte("posted_on", `${year}-12-31`)
      .order("posted_on")
      .range(from, from + 999);
    if (error) throw new Error("We couldn't load the bank lines for the year.");
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const links = {};
  for (let i = 0; i < all.length; i += 200) Object.assign(links, await loadLinks(all.slice(i, i + 200).map((t) => t.id)));
  return { lines: all, links };
}

export function bucketRows(byCategory) {
  return Object.entries(byCategory || {})
    .map(([k, v]) => ({ key: k, label: YEAR_BUCKET_LABEL[k] || k, amount: Number(v) }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

export function MonthChips({ account, year }) {
  return (
    <ol className="acct-chips" aria-label={`${account.name} months`}>
      {(account.months || []).map((m) => {
        const month = String(m.period).slice(0, 7);
        return (
          <li key={month}>
            <Link
              href={`/admin/accounting?month=${month}&account=${account.id}`}
              className={`acct-chip is-${m.status}`}
              title={`${monthOnly(m.period)} ${year}: ${RECON_STATUS_LABEL[m.status] || m.status}`}
            >
              {monthOnly(m.period).slice(0, 3)}
              <span className="visually-hidden"> {RECON_STATUS_LABEL[m.status] || m.status}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function AccountSummary({ account }) {
  return (
    <div className="stack">
      <dl className="acct-sums">
        <div>
          <dt>Opening Jan 1</dt>
          <dd>{dollars(account.opening)}</dd>
        </div>
        <div>
          <dt>Money in</dt>
          <dd>{dollars(account.money_in)}</dd>
        </div>
        <div>
          <dt>Money out</dt>
          <dd className="acct-out">{dollars(-account.money_out)}</dd>
        </div>
        <div>
          <dt>Closing Dec 31</dt>
          <dd>
            <strong>{dollars(account.closing)}</strong>
          </dd>
        </div>
      </dl>
      <table className="data-table">
        <caption className="visually-hidden">Money by category</caption>
        <tbody>
          {bucketRows(account.by_category).map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              <td className={`num${r.amount < 0 ? " acct-out" : ""}`}>{dollars(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const INCOME_COLS = [
  ["management_fees", "Management fees"],
  ["management_hst", "HST on management"],
  ["leasing_fees", "Leasing fees"],
  ["leasing_hst", "HST on leasing"],
  ["lawn_snow", "Lawn/snow"],
  ["other_income", "Other income"],
  ["commissions_paid", "Commissions paid"],
  ["expenses", "Expenses"],
  ["loan_repaid", "Loan repaid"],
];

const EXPENSE_LABEL = {
  agent_payouts: "Leasing commissions paid",
  lawn_snow_payouts: "Lawn/snow contractor",
  cleaning: "Cleaning",
  office_supplies: "Office supplies",
  payprop: "PayProp",
  banking: "Banking",
  docusign: "DocuSign",
  accounting: "Accounting",
  insurance: "Insurance",
  phone: "Phone",
  software: "Software",
  office: "Office space",
  miscellaneous: "Miscellaneous",
  other_expense: "Other",
};

export function ExpensesTable({ rows }) {
  if (!rows?.length) return null;
  return (
    <table className="data-table">
      <caption className="small" style={{ textAlign: "left" }}>
        IRep expenses (before HST)
      </caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.category}>
            <th scope="row">{EXPENSE_LABEL[r.category] || r.category}</th>
            <td className="num">{dollars(r.amount)}</td>
            <td className="num small">
              {[Number(r.hst) ? `HST ${dollars(r.hst)}` : "", Number(r.from_bank) ? `${dollars(r.from_bank)} from bank lines` : ""]
                .filter(Boolean)
                .join(" · ")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function IncomeTable({ rows, year, hst }) {
  const mgmt = Number(hst?.management || 0);
  const leasing = Number(hst?.leasing || 0);
  const lawn = Number(hst?.lawn_snow || 0);
  const itcs = Number(hst?.itcs || 0);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="table-wrap" style={{ marginTop: 0 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Month</th>
              {INCOME_COLS.map(([k, label]) => (
                <th key={k} scope="col" className="num">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period}>
                <th scope="row">{monthOnly(r.period)}</th>
                {INCOME_COLS.map(([k]) => (
                  <td key={k} className="num">
                    {dollars(r[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{year} total</th>
              {INCOME_COLS.map(([k]) => (
                <td key={k} className="num">
                  {dollars(sum(rows, k))}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {hst ? (
        <p className="small">
          HST collected: management {dollars(mgmt)}, leasing {dollars(leasing)}, lawn/snow {dollars(lawn)}, total{" "}
          {dollars(mgmt + leasing + lawn)}. Input tax credits {dollars(itcs)}. Net HST {dollars(mgmt + leasing + lawn - itcs)}.
        </p>
      ) : null}
    </div>
  );
}

const OWNER_COLS = [
  ["rent_collected", "Rent collected"],
  ["management_fees", "Management fees"],
  ["work_orders", "Work orders"],
  ["other_items", "Other items"],
  ["paid_out", "Paid out"],
  ["balance_dec31", "Owing at Dec 31"],
];

export function OwnersTable({ rows }) {
  if (!rows.length) return <p className="small">No landlords yet.</p>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Landlord</th>
            {OWNER_COLS.map(([k, l]) => (
              <th key={k} scope="col" className="num">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.owner}>
              <th scope="row">{r.owner}</th>
              {OWNER_COLS.map(([k]) => (
                <td key={k} className="num">
                  {dollars(r[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            {OWNER_COLS.map(([k]) => (
              <td key={k} className="num">
                {dollars(sum(rows, k))}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadPackage(data) {
  const y = data.year;
  downloadCsv(
    `irep-${y}-accounts.csv`,
    ["account", "opening_jan1", "money_in", "money_out", "closing_dec31"],
    data.accounts.map((a) => [a.name, money(a.opening), money(a.money_in), money(a.money_out), money(a.closing)])
  );
  await wait(400);
  downloadCsv(
    `irep-${y}-accounts-by-category.csv`,
    ["account", "category", "amount"],
    data.accounts.flatMap((a) => bucketRows(a.by_category).map((r) => [a.name, r.label, money(r.amount)]))
  );
  await wait(400);
  downloadCsv(
    `irep-${y}-months.csv`,
    ["account", "month", "status"],
    data.accounts.flatMap((a) => (a.months || []).map((m) => [a.name, String(m.period).slice(0, 7), m.status]))
  );
  await wait(400);
  downloadCsv(
    `irep-${y}-irep-income.csv`,
    ["month", ...INCOME_COLS.map(([k]) => k)],
    [
      ...data.irep_income.map((r) => [String(r.period).slice(0, 7), ...INCOME_COLS.map(([k]) => money(r[k]))]),
      ["hst_collected_management", money(data.hst_collected?.management)],
      ["hst_collected_leasing", money(data.hst_collected?.leasing)],
      ["hst_collected_lawn_snow", money(data.hst_collected?.lawn_snow)],
      [
        "hst_collected_total",
        money(
          Number(data.hst_collected?.management || 0) +
            Number(data.hst_collected?.leasing || 0) +
            Number(data.hst_collected?.lawn_snow || 0)
        ),
      ],
      ["input_tax_credits", money(data.hst_collected?.itcs)],
      ...(data.irep_expenses || []).map((e) => [`expense_${e.category}`, money(e.amount), money(e.hst)]),
    ]
  );
  await wait(400);
  downloadCsv(
    `irep-${y}-landlords.csv`,
    ["landlord", ...OWNER_COLS.map(([k]) => k)],
    data.owners.map((r) => [r.owner, ...OWNER_COLS.map(([k]) => money(r[k]))])
  );
  await wait(400);
  const { lines, links } = await loadYearLines(y);
  downloadCsv(
    `irep-${y}-bank-lines.csv`,
    ["account", "date", "description", "amount", "status", "category", "matched_to", "note"],
    lines.map((t) => [
      t.account?.name || "",
      t.posted_on,
      t.description || "",
      money(t.amount),
      LINE_STATUS_LABEL[t.status] || t.status,
      t.category ? CATEGORY_LABEL[t.category] || t.category : "",
      (links[t.id] || []).map((l) => l.label).join(" | "),
      t.note || "",
    ])
  );
}

export default function YearBoard({ initialYear }) {
  const id = useId();
  const thisYear = Number(todayISO().slice(0, 4));
  const [year, setYear] = useState(initialYear || thisYear);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState("");
  const [closeError, setCloseError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      setData(await loadYear(year));
    } catch (err) {
      setError(err.message);
    }
  }, [year]);

  useEffect(() => {
    setData(null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    loadIsAdmin().then(setIsAdmin);
  }, []);

  async function exportPackage() {
    setBusy("export");
    setError("");
    try {
      await downloadPackage(data);
    } catch (err) {
      setError(err.message || "The download didn't finish. Try again.");
    }
    setBusy("");
  }

  async function closeYear() {
    setBusy("close");
    setCloseError("");
    const { error: err } = await getBrowserClient().rpc("close_fiscal_year", { p_year: year, p_notes: notes.trim() || null });
    setBusy("");
    if (err) {
      setCloseError(staffMessage(err, "The year didn't close. Try again."));
      return;
    }
    refresh();
  }

  const years = [];
  for (let y = thisYear; y >= thisYear - 5; y--) years.push(y);

  return (
    <div className="stack">
      <AccountingTabs title="Year end" subtitle="IRep's fiscal year runs January 1 to December 31.">
        <div className="field acct-picker">
          <label htmlFor={`${id}-year`}>Year</label>
          <select id={`${id}-year`} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </AccountingTabs>

      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      {!data && !error ? <p className="small">Loading…</p> : null}

      {data ? (
        <>
          <div className="row-actions">
            <button type="button" className="btn" onClick={exportPackage} disabled={busy === "export"}>
              {busy === "export" ? "Preparing files…" : "Download accountant package"}
            </button>
            <Link className="btn ghost" href={`/admin/accounting/year/print?year=${year}`} target="_blank">
              Printable summary
            </Link>
          </div>

          {data.accounts.length ? (
            data.accounts.map((a) => (
              <section key={a.id} className="boxed stack" aria-labelledby={`${id}-${a.id}`}>
                <h2 id={`${id}-${a.id}`} className="sec-title">
                  {a.name}
                </h2>
                <MonthChips account={a} year={year} />
                <AccountSummary account={a} />
              </section>
            ))
          ) : (
            <div className="boxed">
              <p className="small">
                No bank account set up yet. <Link href="/admin/accounting">Set one up</Link>.
              </p>
            </div>
          )}

          <section className="boxed stack" aria-labelledby={`${id}-income`}>
            <h2 id={`${id}-income`} className="sec-title">
              IRep income
            </h2>
            <p className="small">
              Months before the website started come from IRep&apos;s corporate accounting workbook. Lawn/snow and some
              expenses come from there too; costs paid straight from the bank (phone, software, office) come from
              bank lines categorised as an IRep business expense, grouped by their note. Months appear as they arrive.
            </p>
            <IncomeTable rows={data.irep_income} year={year} hst={data.hst_collected} />
            <ExpensesTable rows={data.irep_expenses} />
          </section>

          <section className="boxed stack" aria-labelledby={`${id}-owners`}>
            <h2 id={`${id}-owners`} className="sec-title">
              Landlords
            </h2>
            <OwnersTable rows={data.owners} />
          </section>

          <section className="boxed stack" aria-labelledby={`${id}-close`}>
            <h2 id={`${id}-close`} className="sec-title">
              Close {year}
            </h2>
            {data.close ? (
              <div className="okbox">
                Closed on{" "}
                {new Date(data.close.closed_at).toLocaleDateString("en-CA", { dateStyle: "long" })} by{" "}
                {data.close.who?.full_name || data.close.who?.email || "staff"}.
                {data.close.notes ? <p className="small">{data.close.notes}</p> : null}
              </div>
            ) : isAdmin ? (
              <>
                <p className="small">Every month must be reconciled and locked first. Closing saves a copy of these numbers.</p>
                <div className="field">
                  <label htmlFor={`${id}-notes`}>Notes (optional)</label>
                  <textarea id={`${id}-notes`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                {closeError ? (
                  <div className="warnbox" role="alert">
                    {closeError}
                  </div>
                ) : null}
                <div className="row-actions">
                  <button type="button" className="btn" onClick={closeYear} disabled={busy === "close"}>
                    {busy === "close" ? "Closing…" : "Close year"}
                  </button>
                </div>
              </>
            ) : (
              <p className="small">Not closed yet. An admin can close the year once every month is locked.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
