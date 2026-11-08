// Contractor pay (e.g. Chuck). Work orders give his earnings before HST (partner_pay). If he charges HST
// (partners.charges_hst), IRep pays him HST on top, except on jobs marked "no HST" (a price he agreed
// directly with the landlord). Lawn and snow care is a monthly ledger line per property, with its HST.
// Monthly dividends are recorded in the dividends (T5) ledger and shown alongside, but they aren't
// business income and don't change what's owing (they're paid when recorded).
// Leasing fees owed to him are ledger entries, and a share of those can go toward a loan
// (Chuck: 50% to the truck loan) until it's paid off.

import { cents } from "@/lib/rent";

export const LEDGER_KIND_LABEL = {
  leasing_fee: "Leasing fee owed",
  payment: "Paid to contractor",
  loan_opening: "Loan balance added",
  loan_payment: "Loan payment (other)",
  adjustment: "Adjustment",
  lawn_snow: "Lawn and snow care",
};

export const PAY_METHODS = ["e-Transfer", "Cash", "Cheque", "Other"];

export const JOB_SELECT =
  "id, title, status, charge_to, actual_cost, partner_pay, partner_hst, completed_at, unit:units(label, property:properties(id, address))";

const monthOf = (iso) => String(iso || "").slice(0, 7);
export const torontoMonth = (ts) =>
  ts ? new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }).slice(0, 7) : "";

// Walks earnings and ledger entries in date order so the loan share stops once the loan is paid off.
// Returns totals and one row per month (newest first).
export function contractorPay(jobs, ledger, loanSharePct, opts = {}) {
  const pct = Number(loanSharePct || 0);
  const hstPct = Number(opts.hstPct ?? 13);
  const chargesHst = Boolean(opts.chargesHst);
  const events = [
    ...(opts.dividends || []).map((d) => ({ date: `${d.paid_on}T12:00:00Z`, month: monthOf(d.paid_on), type: "dividend", dividend: d })),
    ...jobs
      .filter((j) => j.status === "completed" && j.partner_pay != null)
      .map((j) => ({ date: new Date(j.completed_at).toISOString(), month: torontoMonth(j.completed_at), type: "job", job: j })),
    ...ledger.map((e) => ({ date: `${e.entry_date}T12:00:00Z`, month: monthOf(e.entry_date), type: "ledger", entry: e })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.type === "ledger" ? -1 : 1));

  let loan = 0; // cents still owed on the loan
  let owed = 0; // cents IRep owes the contractor
  const months = new Map();
  const totals = { earned: 0, lawn: 0, hst: 0, dividends: 0, leasing: 0, toLoan: 0, paid: 0, adjustments: 0, loanAdded: 0, loanOther: 0 };
  const row = (m) => {
    if (!months.has(m))
      months.set(m, {
        month: m, jobs: [], fees: [], lawnItems: [], dividendItems: [],
        earned: 0, lawn: 0, hst: 0, dividends: 0, leasing: 0, toLoan: 0, paid: 0, adjustments: 0, owedAtEnd: 0, loanAtEnd: 0,
      });
    return months.get(m);
  };

  for (const ev of events) {
    const r = row(ev.month);
    if (ev.type === "dividend") {
      const amt = cents(ev.dividend.amount);
      r.dividendItems.push(ev.dividend);
      r.dividends += amt;
      totals.dividends += amt;
    } else if (ev.type === "job") {
      const earned = cents(ev.job.partner_pay);
      const hst = chargesHst && ev.job.partner_hst !== false ? Math.round((earned * hstPct) / 100) : 0;
      owed += earned + hst;
      r.jobs.push({ ...ev.job, hst: hst / 100 });
      r.earned += earned;
      r.hst += hst;
      totals.earned += earned;
      totals.hst += hst;
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
      } else if (kind === "lawn_snow") {
        const hst = cents(ev.entry.hst);
        owed += amt + hst;
        r.lawnItems.push(ev.entry);
        r.lawn += amt;
        r.hst += hst;
        totals.lawn += amt;
        totals.hst += hst;
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
      .map((m) => ({
        ...m,
        earned: d(m.earned), lawn: d(m.lawn), hst: d(m.hst), dividends: d(m.dividends), leasing: d(m.leasing), toLoan: d(m.toLoan),
        paid: d(m.paid), adjustments: d(m.adjustments), owedAtEnd: d(m.owedAtEnd), loanAtEnd: d(m.loanAtEnd),
      })),
  };
}

export function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Leasing fees on landlord statements, as ledger-style entries for the partner's share of each
// fee before HST (HST is always held back).
export function statementFeeEntries(fees, sharePct, hstPct = 13) {
  const share = Number(sharePct || 0);
  if (!share) return [];
  const money2 = (n) => `$${Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (fees || []).map((f) => {
    const beforeHst = Math.round((Math.abs(Number(f.amount)) / (1 + hstPct / 100)) * 100) / 100;
    const label = String(f.description || "")
      .replace(/^Leasing fee:\s*/i, "")
      .replace(/\s*\(\$[\d,.]+ \+ HST\)$/, "");
    return {
      id: `si-${f.id}`,
      kind: "leasing_fee",
      entry_date: f.period,
      amount: Math.round(beforeHst * share) / 100,
      notes: `${f.property?.address || ""}: ${label} (fee ${money2(beforeHst)} before HST, ${share}% share)`,
    };
  });
}

// Totals for one calendar year (for a tax summary), from contractorPay().months.
export function yearSummary(pay, year) {
  const ms = pay.months.filter((m) => m.month.startsWith(`${year}-`));
  const c = (k) => ms.reduce((s, m) => s + Math.round(Number(m[k]) * 100), 0) / 100;
  const last = ms[0]; // months are newest first
  return {
    months: ms,
    earned: c("earned"),
    lawn: c("lawn"),
    hst: c("hst"),
    dividends: c("dividends"),
    leasing: c("leasing"),
    toLoan: c("toLoan"),
    paid: c("paid"),
    adjustments: c("adjustments"),
    // Business income before HST (dividends are reported separately on the T5).
    gross: Math.round((c("earned") + c("lawn") + c("leasing") + c("adjustments")) * 100) / 100,
    owedAtEnd: last ? last.owedAtEnd : null,
    loanAtEnd: last ? last.loanAtEnd : null,
  };
}
