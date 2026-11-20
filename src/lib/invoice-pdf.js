import "server-only";
import { createPdf, drawIRepMark, wrap } from "@/lib/simple-pdf";
import { SITE } from "@/lib/site";
import { amount as money, invoiceNumber, qtyText, PAID_METHODS } from "@/lib/invoices";

// Same look as the printable invoices in the portal (components/GeneralInvoice.js,
// components/WorkOrderInvoice.js): house mark and wordmark, office details, red rule,
// Cormorant Garamond headings and Libre Franklin text.
const RED = "#B41710";
const INK = "#161616";
const GREY = "#555555";
const RULE = "#e3ded4";

const longDay = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "";

export const invoiceFileName = (inv) =>
  `${invoiceNumber(inv.invoice_no)} ${inv.property_address || inv.bill_to_name || ""}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") + ".pdf";

// Renders one invoice (from invoice_doc) as a PDF. Returns a Buffer.
export function invoicePdf(inv) {
  const no = invoiceNumber(inv.invoice_no);
  const pdf = createPdf({ title: `${SITE.name} ${no}`, author: SITE.name });
  const M = 54;
  const R = pdf.width - M;
  let y = 0;

  const newPage = () => {
    pdf.addPage();
    y = 54;
  };
  const room = (h) => {
    if (y + h > pdf.height - 60) newPage();
  };
  const label = (text, x, at) => pdf.text(text.toUpperCase(), x, at, { size: 7.5, font: "bodySemi", color: GREY, spacing: 0.9 });

  newPage();

  // Letterhead
  const markH = 36;
  drawIRepMark(pdf, M, y, markH, RED);
  const wx = M + markH * (115.38 / 144.38) + 9;
  pdf.text("IREP", wx, y + 20, { size: 21, font: "display", spacing: 1.7 });
  pdf.text("PROPERTY MANAGEMENT", wx, y + 31, { size: 6.5, font: "bodySemi", spacing: 1.2 });
  const office = [SITE.name, SITE.address, SITE.phone, SITE.email, SITE.hstNumber ? `HST No. ${SITE.hstNumber}` : ""].filter(Boolean);
  office.forEach((l, i) => pdf.text(l, R, y + 8 + i * 13, { size: 9.5, align: "right" }));
  y = Math.max(y + markH, y + 8 + (office.length - 1) * 13) + 14;
  pdf.line(M, y, R, y, { color: RED, width: 1.5 });
  y += 38;

  pdf.text(inv.status === "void" ? "Invoice (Void)" : "Invoice", M, y, { size: 24, font: "display" });
  y += 24;

  // Invoice details (left) and who it's for (right)
  const colR = M + (R - M) / 2 + 12;
  const colW = R - colR;
  let ly = y;
  const fact = (k, v, sub = []) => {
    label(k, M, ly);
    pdf.text(v, M, ly + 13, { size: 10.5 });
    ly += 13;
    for (const s of sub) {
      ly += 12;
      pdf.text(s, M, ly, { size: 9.5, color: GREY });
    }
    ly += 20;
  };
  fact("Invoice", no);
  fact("Date", longDay(inv.issue_date));
  fact("Due", inv.due_date ? longDay(inv.due_date) : "On receipt");
  if (inv.status === "paid") {
    const how = [PAID_METHODS[inv.paid_method] || "", inv.paid_reference || ""].filter(Boolean).join(", ");
    fact("Paid", longDay(inv.paid_on), how ? [how] : []);
  }

  let ry = y;
  const rfact = (k, v, sub = []) => {
    label(k, colR, ry);
    const vl = wrap(v, 10.5, colW);
    vl.forEach((t, i) => pdf.text(t, colR, ry + 13 + i * 13, { size: 10.5 }));
    ry += 13 + (vl.length - 1) * 13;
    for (const s of sub)
      for (const t of wrap(s, 9.5, colW)) {
        ry += 12;
        pdf.text(t, colR, ry, { size: 9.5, color: GREY });
      }
    ry += 20;
  };
  rfact("Bill to", inv.bill_to_name || "", [inv.bill_to_address, inv.bill_to_email].filter(Boolean));
  if (inv.property_address) rfact("Property", inv.property_address);
  y = Math.max(ly, ry) + 6;

  // Title and description
  if (inv.title) {
    room(40);
    pdf.text(inv.title, M, y + 4, { size: 18, font: "display" });
    y += 22;
  }
  for (const l of inv.description ? wrap(inv.description, 10.5, R - M) : []) {
    room(14);
    pdf.text(l, M, y, { size: 10.5 });
    y += 14;
  }
  y += 12;

  // Line items
  const cQty = R - 200;
  const cPrice = R - 95;
  const header = () => {
    pdf.text("Item", M + 6, y, { size: 9, font: "bodySemi", color: GREY });
    pdf.text("Qty", cQty, y, { size: 9, font: "bodySemi", color: GREY, align: "right" });
    pdf.text("Unit price", cPrice, y, { size: 9, font: "bodySemi", color: GREY, align: "right" });
    pdf.text("Amount", R - 6, y, { size: 9, font: "bodySemi", color: GREY, align: "right" });
    y += 7;
    pdf.line(M, y, R, y, { color: RULE });
    y += 15;
  };
  header();
  for (const l of inv.lines || []) {
    const desc = wrap(l.description, 10.5, cQty - M - 60);
    const h = desc.length * 13 + (l.taxable ? 0 : 12);
    if (y + h + 10 > pdf.height - 60) {
      newPage();
      header();
    }
    desc.forEach((d, i) => pdf.text(d, M + 6, y + i * 13, { size: 10.5 }));
    if (!l.taxable) pdf.text("No HST", M + 6, y + desc.length * 13, { size: 9, color: GREY });
    pdf.text(qtyText(l.quantity), cQty, y, { size: 10.5, align: "right" });
    pdf.text(money(l.unit_price), cPrice, y, { size: 10.5, align: "right" });
    pdf.text(money(l.amount), R - 6, y, { size: 10.5, align: "right" });
    y += h - 2;
    pdf.line(M, y, R, y, { color: RULE });
    y += 15;
  }

  // Totals, right-aligned like the portal's invoice
  room(80);
  y += 4;
  const tl = R - 255;
  const row = (k, v, strong) => {
    if (strong) pdf.line(tl, y - 13, R, y - 13, { color: INK, width: 1.5 });
    pdf.text(k, tl, y, { size: 10.5, font: strong ? "bodySemi" : "body" });
    pdf.text(v, R, y, { size: strong ? 11.5 : 10.5, font: strong ? "bodySemi" : "body", align: "right" });
    if (!strong) pdf.line(tl, y + 7, R, y + 7, { color: RULE });
    y += 21;
  };
  row("Subtotal", money(inv.subtotal));
  row(`HST (${Number(inv.hst_percent)}%)`, money(inv.hst));
  row("Total (CAD)", money(inv.total), true);
  y += 10;

  // Payment instructions, or the payment received
  if (inv.status === "paid") {
    room(30);
    pdf.text(`Paid in full on ${longDay(inv.paid_on)}. Thank you.`, M, y, { size: 10.5, font: "bodySemi", color: RED });
    y += 22;
  } else if (inv.notes) {
    const lines = wrap(inv.notes, 10.5, R - M);
    room(lines.length * 14 + 26);
    label("Payment", M, y);
    y += 14;
    lines.forEach((l) => {
      pdf.text(l, M, y, { size: 10.5 });
      y += 14;
    });
    y += 8;
  }
  if (inv.status === "void" && inv.void_reason) {
    room(24);
    pdf.text(`This invoice was voided: ${inv.void_reason}`, M, y, { size: 10.5, color: GREY });
    y += 18;
  }

  room(24);
  y += 6;
  pdf.text(`Questions? Call ${SITE.phone} or email ${SITE.email}.`, M, y, { size: 9.5, color: GREY });
  return pdf.toBuffer();
}
