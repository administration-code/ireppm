import { money } from "@/lib/format";
import { cents } from "@/lib/rent";

export const ITEM_KIND_LABEL = {
  leasing_fee: "Leasing fee",
  expense: "Expense",
  fee_adjustment: "Fee adjustment",
  carryover: "Carry-over",
  other: "Other",
};

// Staff type a positive number for these and it's saved as a deduction.
export const DEDUCT_ONLY_KINDS = ["leasing_fee", "expense"];

export const PAYOUT_METHOD_LABEL = {
  etransfer: "e-Transfer",
  payprop: "PayProp",
  cheque: "Cheque",
  other: "Other",
};

export const isPeriod = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));

export function nextPeriodStart(period) {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export const addMoney = (...values) => values.reduce((s, v) => s + cents(v), 0) / 100;
export const sumBy = (list, key) => list.reduce((s, x) => s + cents(x[key]), 0) / 100;

// Shows money with a sign so deductions read clearly: "−$120" or "+$50".
export function signedMoney(value) {
  const c = cents(value);
  if (c === 0) return money(0);
  return `${c < 0 ? "−" : "+"}${money(Math.abs(c) / 100)}`;
}

// "Overpaid $X" when below zero, otherwise the amount still owed to the owner.
export function toPayLabel(value) {
  const c = cents(value);
  if (c < 0) return { text: `Overpaid ${money(Math.abs(c) / 100)}`, cls: "overpaid" };
  return { text: money(c / 100), cls: c > 0 ? "to-pay" : "" };
}

// Leasing fee = rent × months of rent, plus HST, rounded to cents.
export function leasingFee(rent, months, hstPercent) {
  const fee = Math.round(Number(rent || 0) * Number(months || 0) * 100) / 100;
  const hst = Math.round(fee * Number(hstPercent || 0)) / 100;
  return { fee, hst, total: addMoney(fee, hst) };
}
