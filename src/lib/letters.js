import { cents, todayISO } from "@/lib/rent";
import { CLOSED_STATUSES } from "@/lib/maintenance";

export const LETTER_SELECT = "id, owner_id, period, status, data, staff_note, sent_at, sent_to, updated_at";

// "2026-10" for the month before the current one in Windsor.
export function lastMonth() {
  const [y, m] = todayISO().split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export const letterProperties = (letter) => letter?.data?.properties || [];

// Totals across every property in the letter.
export function letterTotals(letter) {
  let net = 0;
  let paid = 0;
  let balance = 0;
  let collected = 0;
  for (const p of letterProperties(letter)) {
    const s = p.statement;
    if (!s) continue;
    net += cents(s.net_due);
    paid += cents(s.paid_out);
    balance += cents(s.to_pay);
    collected += cents(s.rent_collected);
  }
  return { net: net / 100, paid: paid / 100, balance: balance / 100, collected: collected / 100 };
}

const count = (list) => (Array.isArray(list) ? list.length : 0);

export function letterHighlights(letter) {
  const h = { arrears: 0, notices: 0, newTenancies: 0, moveOuts: 0, openWorkOrders: 0 };
  for (const p of letterProperties(letter)) {
    h.arrears += count(p.arrears);
    h.notices += count(p.notices);
    h.newTenancies += count(p.new_tenancies);
    h.moveOuts += count(p.ended_tenancies);
    h.openWorkOrders += (p.work_orders || []).filter((w) => !CLOSED_STATUSES.includes(w.status)).length;
  }
  return h;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function highlightsText(h) {
  return [
    plural(h.arrears, "tenant in arrears", "tenants in arrears"),
    plural(h.notices, "notice served", "notices served"),
    plural(h.newTenancies, "new tenancy", "new tenancies"),
    plural(h.moveOuts, "move-out", "move-outs"),
    plural(h.openWorkOrders, "open work order", "open work orders"),
  ].join(" · ");
}
