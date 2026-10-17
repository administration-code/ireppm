import { getBrowserClient } from "@/lib/supabase";
import { cents, monthLabel, primaryTenant, todayISO } from "@/lib/rent";

export const TRUST_PAYMENT_METHODS = ["etransfer", "direct_deposit", "cheque", "cash", "other"];
export const TRUST_PAYOUT_METHODS = ["etransfer", "cheque", "other"];

export const CATEGORY_LABEL = {
  irep_fees: "IRep fees moved to the operating account",
  vendor_payment: "Paid a contractor",
  deposit_refund: "Deposit refunded to a tenant",
  owner_contribution: "Money from a landlord",
  bank_fee: "Bank fee",
  interest: "Interest",
  transfer: "Transfer between IRep accounts",
  correction: "Bank correction or reversal",
  other: "Other",
};

// Year-summary buckets: the categories above plus matched lines and ignored ones.
export const YEAR_BUCKET_LABEL = {
  rent_received: "Rent received",
  owner_payouts: "Landlord payouts",
  ...CATEGORY_LABEL,
  ignored: "Ignored lines",
  unmatched: "Not yet matched",
};

export const LINE_STATUS_LABEL = {
  unmatched: "Needs attention",
  matched: "Matched",
  categorized: "Categorised",
  ignored: "Ignored",
};

export const RECON_STATUS_LABEL = { open: "Open", balanced: "Balanced", locked: "Locked" };

// Always two decimals: $1,234.56. Money out gets a minus sign.
export function dollars(n) {
  const v = cents(n) / 100;
  const text = "$" + Math.abs(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `−${text}` : text;
}

// Year-end reports: last year in January to March, this year otherwise.
export function defaultReportYear(today = todayISO()) {
  const [y, m] = today.split("-").map(Number);
  return m <= 3 ? y - 1 : y;
}

export function reportYears(today = todayISO(), back = 5) {
  const y = Number(today.slice(0, 4));
  return Array.from({ length: back + 1 }, (_, i) => y - i);
}

export const PAY_METHOD_LABEL = { etransfer: "e-Transfer", cheque: "Cheque", cash: "Cash", other: "Other" };

export const isMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));

export function lastMonth(today = todayISO()) {
  const [y, m] = today.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function monthBounds(month) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const dayGap = (a, b) => Math.round(Math.abs(new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86400000);

export const monthOnly = (period) => monthLabel(period).replace(/\s\d{4}$/, "");

// Database errors that staff should read as-is (locked months, reconciliation rules).
export function staffMessage(error, fallback = "That didn't save. Try again.") {
  const msg = error?.message || "";
  if (!msg || /violates|syntax|permission denied|JWT|fetch/i.test(msg)) return fallback;
  return msg;
}

export const lockedMessage = (error, fallback) =>
  /locked/i.test(error?.message || "") ? error.message : fallback;

export async function loadIsAdmin() {
  const sb = getBrowserClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return false;
  const { data } = await sb.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  return data?.role === "admin";
}

export async function loadAccounts() {
  const { data, error } = await getBrowserClient()
    .from("bank_accounts")
    .select("*")
    .eq("active", true)
    .order("created_at");
  if (error) throw new Error("We couldn't load the bank accounts. Refresh the page to try again.");
  return data || [];
}

// Tenancy details for payments (payments has two tenancy columns, so fetch them separately).
export async function loadTenancies(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map();
  const { data } = await getBrowserClient()
    .from("tenancies")
    .select("id, unit:units(id, label, property:properties(address)), tenancy_tenants(full_name, is_primary, created_at)")
    .in("id", list);
  return new Map((data || []).map((t) => [t.id, t]));
}

export function tenancyPlace(t) {
  if (!t?.unit) return "";
  return [t.unit.property?.address, t.unit.label].filter(Boolean).join(", ");
}

export function describePayment(p, tenancy) {
  const who = p.payer_name || "Unknown sender";
  const tenant = tenancy ? primaryTenant(tenancy) : "";
  const place = tenancyPlace(tenancy);
  return [who, tenant && tenant !== who ? tenant : "", place].filter(Boolean).join(" · ");
}

// Every link for a set of bank lines, with a readable label for each.
export async function loadLinks(txIds) {
  const sb = getBrowserClient();
  if (!txIds.length) return {};
  const { data: links } = await sb.from("bank_transaction_links").select("*").in("bank_transaction_id", txIds);
  const rows = links || [];
  const paymentIds = rows.map((l) => l.payment_id).filter(Boolean);
  const payoutIds = rows.map((l) => l.owner_payout_id).filter(Boolean);
  const workIds = rows.map((l) => l.maintenance_request_id).filter(Boolean);
  const [payments, payouts, works] = await Promise.all([
    paymentIds.length
      ? sb.from("payments").select("id, received_on, amount, payer_name, tenancy_id").in("id", paymentIds)
      : { data: [] },
    payoutIds.length
      ? sb.from("owner_payouts").select("id, paid_on, amount, period, property_id, property:properties(address)").in("id", payoutIds)
      : { data: [] },
    workIds.length ? sb.from("maintenance_requests").select("id, title, actual_cost").in("id", workIds) : { data: [] },
  ]);
  const tenancies = await loadTenancies((payments.data || []).map((p) => p.tenancy_id));
  const pay = new Map((payments.data || []).map((p) => [p.id, p]));
  const out = new Map((payouts.data || []).map((p) => [p.id, p]));
  const wo = new Map((works.data || []).map((w) => [w.id, w]));

  const byTx = {};
  for (const l of rows) {
    let label = "";
    let href = "";
    if (l.payment_id) {
      const p = pay.get(l.payment_id);
      const t = tenancies.get(p?.tenancy_id);
      label = p ? `Rent payment · ${describePayment(p, t)}` : "Rent payment";
      href = t?.unit?.id ? `/admin/units/${t.unit.id}` : "/admin/rent/match";
    } else if (l.owner_payout_id) {
      const p = out.get(l.owner_payout_id);
      label = `Landlord payout · ${p?.property?.address || "property"}`;
      href = p ? `/admin/payouts/${p.property_id}/${String(p.period).slice(0, 7)}` : "/admin/payouts";
    } else {
      const w = wo.get(l.maintenance_request_id);
      label = `Work order · ${w?.title || "maintenance"}`;
      href = `/admin/maintenance/${l.maintenance_request_id}`;
    }
    (byTx[l.bank_transaction_id] ||= []).push({ ...l, label, href });
  }
  return byTx;
}

// Where to open a payment or payout from the checklist.
export async function hrefForPayment(id) {
  const sb = getBrowserClient();
  const { data } = await sb.from("payments").select("tenancy_id, status").eq("id", id).maybeSingle();
  if (!data?.tenancy_id) return "/admin/rent/match";
  const t = (await loadTenancies([data.tenancy_id])).get(data.tenancy_id);
  return t?.unit?.id ? `/admin/units/${t.unit.id}` : "/admin/rent";
}

export async function hrefForPayout(id) {
  const { data } = await getBrowserClient().from("owner_payouts").select("property_id, period").eq("id", id).maybeSingle();
  return data ? `/admin/payouts/${data.property_id}/${String(data.period).slice(0, 7)}` : "/admin/payouts";
}

// When each payment / payout cleared the bank (posted date of its bank line).
export async function loadClearing({ paymentIds = [], payoutIds = [] }) {
  const sb = getBrowserClient();
  const result = { payments: new Map(), payouts: new Map() };
  const queries = [];
  if (paymentIds.length) {
    queries.push(
      sb
        .from("bank_transaction_links")
        .select("payment_id, tx:bank_transactions(posted_on)")
        .in("payment_id", paymentIds)
        .then(({ data }) => (data || []).forEach((l) => result.payments.set(l.payment_id, l.tx?.posted_on || null)))
    );
  }
  if (payoutIds.length) {
    queries.push(
      sb
        .from("bank_transaction_links")
        .select("owner_payout_id, tx:bank_transactions(posted_on)")
        .in("owner_payout_id", payoutIds)
        .then(({ data }) => (data || []).forEach((l) => result.payouts.set(l.owner_payout_id, l.tx?.posted_on || null)))
    );
  }
  await Promise.all(queries);
  return result;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
export function parseCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (headers, rows) => [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

export function downloadCsv(fileName, headers, rows) {
  const blob = new Blob(["\uFEFF" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// "$1,234.56", "(123.45)", "-12.00", "12.00-" -> number. Blank -> null.
export function parseAmount(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/-$/.test(s)) {
    negative = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/CAD/i, "").trim();
  if (/^\$?-/.test(s)) negative = !negative;
  s = s.replace(/[$,\s-]/g, "");
  if (!s || !/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

const DATE_RE = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/;

// Which order do the dates use? "iso", "mdy", "dmy" or null when we can't tell.
export function detectDateOrder(values) {
  let sawIso = false;
  let firstBig = false;
  let secondBig = false;
  let any = false;
  for (const v of values) {
    const m = DATE_RE.exec(String(v || "").trim());
    if (!m) continue;
    any = true;
    if (m[1].length === 4) {
      sawIso = true;
      continue;
    }
    if (Number(m[1]) > 12) firstBig = true;
    if (Number(m[2]) > 12) secondBig = true;
  }
  if (!any) return null;
  if (sawIso) return "iso";
  if (firstBig && !secondBig) return "dmy";
  if (secondBig && !firstBig) return "mdy";
  return null;
}

export function parseDate(raw, order) {
  const m = DATE_RE.exec(String(raw || "").trim());
  if (!m) return null;
  let y;
  let mo;
  let d;
  if (m[1].length === 4) [y, mo, d] = [m[1], m[2], m[3]];
  else if (order === "dmy") [d, mo, y] = [m[1], m[2], m[3]];
  else [mo, d, y] = [m[1], m[2], m[3]];
  if (String(y).length === 2) y = `20${y}`;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso ? null : iso;
}

// Guess the columns from a header row.
export function guessMapping(header, sample) {
  const find = (re) => header.findIndex((h) => re.test(String(h).trim()));
  const mapping = {
    hasHeader: true,
    date: find(/date|posted/i),
    description: find(/desc|details|memo|narrative|payee|transaction$/i),
    extra: -1,
    amount: find(/^amount|amount$|^cad|value/i),
    debit: find(/withdraw|debit|money out|paid out/i),
    credit: find(/deposit|credit|money in|paid in/i),
    balance: find(/balance/i),
    dateOrder: null,
  };
  mapping.mode = mapping.amount === -1 && (mapping.debit !== -1 || mapping.credit !== -1) ? "split" : "single";
  if (mapping.date !== -1) mapping.dateOrder = detectDateOrder(sample.map((r) => r[mapping.date]));
  return mapping;
}

// Scotiabank: no header; date, amount, blank, type, description.
export function scotiabankMapping(rows) {
  return {
    hasHeader: false,
    date: 0,
    amount: 1,
    description: 4,
    extra: 3,
    debit: -1,
    credit: -1,
    balance: -1,
    mode: "single",
    dateOrder: detectDateOrder(rows.map((r) => r[0])),
  };
}

export function looksHeaderless(rows) {
  const first = rows[0] || [];
  return first.some((c) => DATE_RE.test(String(c).trim()));
}

export function applyMapping(rows, mapping) {
  const body = mapping.hasHeader ? rows.slice(1) : rows;
  const col = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  return body.map((r, index) => {
    const posted_on = parseDate(col(r, mapping.date), mapping.dateOrder);
    let amount;
    if (mapping.mode === "split") {
      const out = parseAmount(col(r, mapping.debit));
      const inn = parseAmount(col(r, mapping.credit));
      amount = (inn ? Math.abs(inn) : 0) - (out ? Math.abs(out) : 0);
      if (!out && !inn) amount = null;
    } else amount = parseAmount(col(r, mapping.amount));
    const description = [col(r, mapping.extra), col(r, mapping.description)].filter(Boolean).join(" · ");
    const balance = parseAmount(col(r, mapping.balance));
    const problem = !posted_on ? "date" : amount == null || amount === 0 ? "amount" : "";
    return { index, posted_on, description, amount, running_balance: balance, problem };
  });
}
