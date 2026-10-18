"use client";

import Link from "next/link";
import { useState } from "react";
import { dollars, hrefForPayment, hrefForPayout } from "@/lib/accounting";

const SEVERITY_LABEL = { error: "Must fix", warning: "Check", info: "Note" };
const ORDER = { error: 0, warning: 1, info: 2 };

function ShowMe({ issue, onShowLine }) {
  const [busy, setBusy] = useState(false);

  async function open(getHref) {
    setBusy(true);
    const href = await getHref();
    setBusy(false);
    window.open(href, "_blank", "noopener");
  }

  if (issue.bank_transaction_id) {
    return (
      <button type="button" className="link-btn" onClick={() => onShowLine(issue.bank_transaction_id)}>
        Show me
      </button>
    );
  }
  if (issue.payment_id) {
    return (
      <button type="button" className="link-btn" disabled={busy} onClick={() => open(() => hrefForPayment(issue.payment_id))}>
        Open payment
      </button>
    );
  }
  if (issue.owner_payout_id) {
    return (
      <button type="button" className="link-btn" disabled={busy} onClick={() => open(() => hrefForPayout(issue.owner_payout_id))}>
        Open payout
      </button>
    );
  }
  if (issue.code === "no_lines") return <Link href="/admin/accounting/import">Go to Bank imports</Link>;
  return null;
}

export default function IssuesList({ issues, onShowLine }) {
  const list = [...issues].sort((a, b) => (ORDER[a.severity] ?? 3) - (ORDER[b.severity] ?? 3));
  const blocking = list.filter((i) => i.severity === "error" || i.severity === "warning");

  return (
    <section className="boxed stack" aria-labelledby="acct-issues-title">
      <div className="req-top">
        <h2 id="acct-issues-title" className="sec-title">
          What Needs Fixing
        </h2>
        {blocking.length ? (
          <span className="tab-count">{blocking.length}</span>
        ) : null}
      </div>

      {!blocking.length ? (
        <div className="okbox">Everything checks out. You can mark this month balanced.</div>
      ) : null}

      {list.length ? (
        <ul className="acct-issues">
          {list.map((issue, i) => (
            <li key={`${issue.code}-${issue.bank_transaction_id || issue.payment_id || issue.owner_payout_id || i}`} className={`acct-issue sev-${issue.severity}`}>
              <span className={`pill sev-pill sev-${issue.severity}`}>{SEVERITY_LABEL[issue.severity] || issue.severity}</span>
              <div className="acct-issue-body">
                <p className="acct-issue-title">{issue.title}</p>
                {issue.detail ? <p className="small">{issue.detail}</p> : null}
                {issue.fix ? (
                  <p className="small">
                    <strong>How to fix:</strong> {issue.fix}
                  </p>
                ) : null}
              </div>
              <div className="acct-issue-end">
                {issue.amount != null && issue.code !== "statement_off" ? (
                  <span className={`num${Number(issue.amount) < 0 ? " acct-out" : ""}`}>{dollars(issue.amount)}</span>
                ) : null}
                <ShowMe issue={issue} onShowLine={onShowLine} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
