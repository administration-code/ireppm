// Itemized work-order invoices. Amounts are in dollars; totals are worked out in cents.
import { cents } from "@/lib/rent";

export const invoiceNumber = (n) => (n ? `WO-${String(n).padStart(5, "0")}` : "WO-—");

export function lineAmount(line) {
  return Math.round(Number(line.quantity || 0) * cents(line.unit_price));
}

// { subtotal, hst, total } in dollars.
export function invoiceTotals(lines, hstPercent) {
  let sub = 0;
  let taxable = 0;
  for (const l of lines) {
    const a = lineAmount(l);
    sub += a;
    if (l.taxable) taxable += a;
  }
  const hst = Math.round((taxable * Number(hstPercent || 0)) / 100);
  return { subtotal: sub / 100, hst: hst / 100, total: (sub + hst) / 100 };
}
