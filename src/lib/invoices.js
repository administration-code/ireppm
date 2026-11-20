// General invoices (leasing fees for leasing-only clients, and anything else IRep bills).
// Amounts are dollars; totals are worked out the same way as the database (invoice_totals).
import { SITE } from "@/lib/site";

export const invoiceNumber = (n) => (n ? `INV-${String(n).padStart(5, "0")}` : "Draft");

export const INVOICE_STATUS = { draft: "Draft", sent: "Sent", paid: "Paid", void: "Void" };

export const LINE_CATEGORIES = {
  leasing_fee: "Leasing fee",
  service: "Service",
  other: "Other",
};

export const PAID_METHODS = {
  etransfer: "e-Transfer",
  cheque: "Cheque",
  direct_deposit: "Direct deposit",
  cash: "Cash",
  card: "Card",
  deducted: "Deducted from rent or payout",
  other: "Other",
};

export const defaultPaymentNote = () =>
  `Please pay by e-Transfer to ${SITE.paymentEmail}, with the invoice number in the message, or contact us for other ways to pay.`;

const cents = (v) => Math.round(Number(v || 0) * 100);
export const lineAmount = (l) => Math.round(Number(l.quantity || 0) * cents(l.unit_price)) / 100;

export function invoiceTotals(lines, hstPercent) {
  let sub = 0;
  let taxable = 0;
  for (const l of lines || []) {
    const a = Math.round(Number(l.quantity || 0) * cents(l.unit_price));
    sub += a;
    if (l.taxable) taxable += a;
  }
  const hst = Math.round((taxable * Number(hstPercent || 0)) / 100);
  return { subtotal: sub / 100, hst: hst / 100, total: (sub + hst) / 100 };
}

const qtyText = (q) => (Number(q) % 1 === 0 ? String(Number(q)) : Number(q).toFixed(2));
export { qtyText };

// Invoices always show cents: $625.00.
export const amount = (v) =>
  "$" + (Math.round(Number(v || 0) * 100) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
