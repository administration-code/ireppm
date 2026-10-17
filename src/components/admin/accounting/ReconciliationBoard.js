"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import {
  CATEGORY_LABEL,
  downloadCsv,
  lastMonth,
  loadAccounts,
  loadIsAdmin,
  loadLinks,
  monthBounds,
  RECON_STATUS_LABEL,
  staffMessage,
} from "@/lib/accounting";
import { monthLabel, shortDate } from "@/lib/rent";
import AccountingTabs from "./AccountingTabs";
import AccountSetup from "./AccountSetup";
import IssuesList from "./IssuesList";
import BalancesCard from "./BalancesCard";
import BankLines from "./BankLines";
import ThreeWayCard from "./ThreeWayCard";
import OutstandingCard from "./OutstandingCard";
import ReconActions from "./ReconActions";

async function loadMonth(accountId, month) {
  const sb = getBrowserClient();
  const period = `${month}-01`;
  const { start, end } = monthBounds(month);
  const [summary, issues, lines, rec, year] = await Promise.all([
    sb.rpc("reconciliation_summary", { p_account_id: accountId, p_period: period }),
    sb.rpc("reconciliation_issues", { p_account_id: accountId, p_period: period }),
    sb
      .from("bank_transactions")
      .select("id, posted_on, description, amount, running_balance, status, category, note, created_at")
      .eq("account_id", accountId)
      .gte("posted_on", start)
      .lte("posted_on", end)
      .order("posted_on")
      .order("created_at"),
    sb.from("reconciliations").select("*").eq("account_id", accountId).eq("period", period).maybeSingle(),
    sb.rpc("fiscal_year_summary", { p_year: Number(month.slice(0, 4)) }),
  ]);
  if (summary.error || lines.error) throw new Error("We couldn't load this month. Refresh the page to try again.");
  const rows = lines.data || [];
  const links = await loadLinks(rows.map((r) => r.id));
  let lockedBy = "";
  if (rec.data?.locked_by) {
    const { data } = await sb.from("profiles").select("full_name, email").eq("id", rec.data.locked_by).maybeSingle();
    lockedBy = data?.full_name || data?.email || "";
  }
  const months = (year.data?.accounts || []).find((a) => a.id === accountId)?.months || [];
  return {
    summary: summary.data || {},
    issues: issues.data || [],
    lines: rows,
    links,
    rec: rec.data || null,
    lockedBy,
    months,
  };
}

function MonthStrip({ months, month, onPick }) {
  if (!months.length) return null;
  return (
    <ol className="acct-strip" aria-label="Months this year">
      {months.map((m) => {
        const key = String(m.period).slice(0, 7);
        const status = m.status || "open";
        return (
          <li key={key}>
            <button
              type="button"
              className={`acct-chip st-${status}`}
              aria-current={key === month ? "page" : undefined}
              title={RECON_STATUS_LABEL[status] || status}
              onClick={() => onPick(key)}
            >
              <span>{monthLabel(m.period).replace(/\s\d{4}$/, "").slice(0, 3)}</span>
              <span className="visually-hidden">: </span>
              {status === "open" ? null : <span className="acct-chip-status">{RECON_STATUS_LABEL[status] || status}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function AutoMatch({ accountId, onDone }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    setMsg("");
    const { data, error } = await getBrowserClient().rpc("auto_match_bank_lines", { p_account_id: accountId });
    setBusy(false);
    if (error) return setMsg(staffMessage(error, "Auto-match didn't run. Try again."));
    const n = Number(data) || 0;
    setMsg(n ? `Matched ${n} bank line${n === 1 ? "" : "s"}.` : "Nothing new to match automatically.");
    onDone();
  }

  return (
    <div className="acct-automatch no-print">
      <button type="button" className="btn ghost sm" disabled={busy} onClick={run}>
        {busy ? "Matching…" : "Auto-match"}
      </button>
      <span className="small" role="status">
        {msg || "Matches bank lines to a single payment or payout with the same amount and a close date."}
      </span>
    </div>
  );
}

function exportMonth(account, month, lines, links) {
  const rows = lines.map((l) => [
    l.posted_on,
    l.description,
    Number(l.amount).toFixed(2),
    l.status,
    l.category ? CATEGORY_LABEL[l.category] || l.category : "",
    (links[l.id] || []).map((x) => x.label).join("; "),
    l.note || "",
  ]);
  downloadCsv(`${account.name} ${month}.csv`, ["Date", "Description", "Amount", "Status", "Category", "Matched to", "Note"], rows);
}

export default function ReconciliationBoard({ initialMonth, initialAccount }) {
  const router = useRouter();
  const pickerId = useId();
  const [accounts, setAccounts] = useState(null);
  const [accountId, setAccountId] = useState(initialAccount || "");
  const [month, setMonth] = useState(initialMonth || lastMonth());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [highlight, setHighlight] = useState("");

  const loadAccountList = useCallback(async () => {
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
    loadAccountList();
    loadIsAdmin().then(setIsAdmin, () => setIsAdmin(false));
  }, [loadAccountList]);

  const reload = useCallback(async () => {
    if (!accountId) return;
    try {
      setData(await loadMonth(accountId, month));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [accountId, month]);

  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);

  function go(nextMonth, nextAccount = accountId) {
    setMonth(nextMonth);
    setAccountId(nextAccount);
    setHighlight("");
    const qs = new URLSearchParams({ month: nextMonth });
    if (accounts?.length > 1) qs.set("account", nextAccount);
    router.replace(`/admin/accounting?${qs}`, { scroll: false });
  }

  function showLine(id) {
    setHighlight(id);
    requestAnimationFrame(() => {
      document.getElementById(`bank-line-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  const account = accounts?.find((a) => a.id === accountId);
  const locked = data?.summary?.status === "locked";

  if (accounts === null) {
    return (
      <div className="stack">
        <AccountingTabs title="Trust reconciliation" />
        <p className="small">Loading…</p>
      </div>
    );
  }

  if (!accounts.length) {
    return (
      <div className="stack">
        <AccountingTabs title="Trust reconciliation" />
        {error ? <div className="warnbox">{error}</div> : null}
        <AccountSetup onSaved={loadAccountList} />
      </div>
    );
  }

  return (
    <div className="stack">
      <AccountingTabs
        title="Trust reconciliation"
        subtitle={account ? [account.name, account.account_last4 ? `····${account.account_last4}` : ""].filter(Boolean).join(" ") : ""}
      >
        <div className="acct-pickers no-print">
          {accounts.length > 1 ? (
            <div className="field">
              <label htmlFor={`${pickerId}-acct`}>Account</label>
              <select id={`${pickerId}-acct`} value={accountId} onChange={(e) => go(month, e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.account_last4 ? ` ····${a.account_last4}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor={`${pickerId}-month`}>Month</label>
            <input
              id={`${pickerId}-month`}
              type="month"
              value={month}
              min={account?.opening_date?.slice(0, 7)}
              onChange={(e) => e.target.value && go(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn ghost sm"
            disabled={!data}
            onClick={() => exportMonth(account, month, data.lines, data.links)}
          >
            Download month (CSV)
          </button>
        </div>
      </AccountingTabs>

      {data ? <MonthStrip months={data.months} month={month} onPick={go} /> : null}

      {error ? <div className="warnbox">{error}</div> : null}

      {!data ? (
        <p className="small">Loading {monthLabel(`${month}-01`)}…</p>
      ) : (
        <>
          <div className="acct-status-line">
            <h2 className="sec-title">{monthLabel(`${month}-01`)}</h2>
            <span className={`pill acct-st st-${data.summary.status || "open"}`}>
              {RECON_STATUS_LABEL[data.summary.status] || "Open"}
            </span>
            {locked && data.rec?.locked_at ? (
              <span className="small">
                Locked {shortDate(data.rec.locked_at.slice(0, 10))}
                {data.lockedBy ? ` by ${data.lockedBy}` : ""}
              </span>
            ) : null}
          </div>

          {locked ? (
            <div className="okbox">
              This month is locked. Its bank lines, rent payments and payouts can&apos;t be changed until an admin unlocks it.
            </div>
          ) : null}

          <IssuesList issues={data.issues} month={month} onShowLine={showLine} />

          <BalancesCard
            key={`${accountId}-${month}`}
            accountId={accountId}
            month={month}
            summary={data.summary}
            locked={locked}
            onSaved={reload}
          />

          {!locked ? <AutoMatch accountId={accountId} onDone={reload} /> : null}

          <BankLines
            accountId={accountId}
            month={month}
            lines={data.lines}
            links={data.links}
            locked={locked}
            highlight={highlight}
            onChanged={reload}
          />

          <OutstandingCard summary={data.summary} />

          <ThreeWayCard summary={data.summary} />

          <ReconActions
            key={`actions-${accountId}-${month}`}
            accountId={accountId}
            month={month}
            summary={data.summary}
            rec={data.rec}
            isAdmin={isAdmin}
            onChanged={reload}
          />

          <p className="small no-print">
            Bank lines come from <Link href="/admin/accounting/import">Bank imports</Link>. Year-end totals are on{" "}
            <Link href={`/admin/accounting/year?year=${month.slice(0, 4)}`}>Year end</Link>.
          </p>
        </>
      )}
    </div>
  );
}
