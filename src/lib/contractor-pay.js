// Contractor pay (e.g. Chuck). Work orders give his earnings before HST (partner_pay);
// the owner is billed that plus HST and IRep holds the HST back; these are paid in full.
// Leasing fees owed to him are ledger entries, and a share of those can go toward a loan
// (Chuck: 50% to the truck loan) until it's paid off.

import { cents } from "@/lib/rent";

export const LEDGER_KIND_LABEL = {
  leasing_fee: "Leasing fee owed",
  payment: "Paid to contractor",
  loan_opening: "Loan balance added",
  loan_payment: "Loan payment (other)",
  adjustment: "Adjustment",
};

export const PAY_METHODS = ["e-Transfer", "Cash", "Cheque", "Other"];

export const JOB_SELECT =
  "id, title, status, charge_to, actual_cost, partner_pay, completed_at, unit:units(label, property:properties(id, address))";

const monthOf = (iso) => String(iso || "").slice(0, 7);
export const torontoMonth = (ts) =>
  ts ? new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }).slice(0, 7) : "";

// Walks earnings and ledger entries in date order so the loan share stops once the loan is paid off.
// Returns totals and one row per month (newest first).
export function contractorPay(jobs, ledger, loanSharePct) {
  const pct = Number(loanSharePct || 0);
  const events = [
    ...jobs
      .filter((j) => j.status === "completed" && j.partner_pay != null)
      .map((j) => ({ date: new Date(j.completed_at).toISOString(), month: torontoMonth(j.completed_at), type: "job", job: j })),
    ...ledger.map((e) => ({ date: `${e.entry_date}T12:00:00Z`, month: monthOf(e.entry_date), type: "ledger", entry: e })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.type === "ledger" ? -1 : 1));

  let loan = 0; // cents still owed on the loan
  let owed = 0; // cents IRep owes the contractor
  const months = new Map();
  const totals = { earned: 0, leasing: 0, toLoan: 0, paid: 0, adjustments: 0, loanAdded: 0, loanOther: 0 };
  const row = (m) => {
    if (!months.has(m)) months.set(m, { month: m, jobs: [], fees: [], earned: 0, leasing: 0, toLoan: 0, paid: 0, adjustments: 0, owedAtEnd: 0, loanAtEnd: 0 });
    return months.get(m);
  };

  for (const ev of events) {
    const r = row(ev.month);
    if (ev.type === "job") {
      const earned = cents(ev.job.partner_pay);
      owed += earned;
      r.jobs.push(ev.job);
      r.earned += earned;
      totals.earned += earned;
    } else {
      const { kind } = ev.entry;
      const amt = cents(ev.entry.amount);
      if (kind === "leasing_fee") {
        const share = Math.min(Math.round((amt * pct) / 100), Math.max(loan, 0));
        loan -= share;
        owed += amt - share;
        r.fees.push({ ...ev.entry, toLoan: share / 100 });
        r.leasing += amt;
        r.toLoan += share;
        totals.leasing += amt;
        totals.toLoan += share;
      } else if (kind === "payment") {
        owed -= amt;
        r.paid += amt;
        totals.paid += amt;
      } else if (kind === "adjustment") {
        owed += amt;
        r.adjustments += amt;
        totals.adjustments += amt;
      } else if (kind === "loan_opening") {
        loan += amt;
        totals.loanAdded += amt;
      } else if (kind === "loan_payment") {
        loan -= amt;
        totals.loanOther += amt;
      }
    }
    r.owedAtEnd = owed;
    r.loanAtEnd = loan;
  }

  const d = (c) => c / 100;
  return {
    owed: d(owed),
    loanBalance: d(Math.max(loan, 0)),
    loanSet: totals.loanAdded > 0,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, d(v)])),
    months: [...months.values()]
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((m) => ({ ...m, earned: d(m.earned), leasing: d(m.leasing), toLoan: d(m.toLoan), paid: d(m.paid), adjustments: d(m.adjustments), owedAtEnd: d(m.owedAtEnd), loanAtEnd: d(m.loanAtEnd) })),
  };
}

export function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
}
