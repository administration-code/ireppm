import "server-only";
import { createPdf, wrap } from "@/lib/simple-pdf";
import { SITE } from "@/lib/site";
import { amount as money, invoiceNumber, qtyText, PAID_METHODS } from "@/lib/invoices";

const RED = "#B41710";
const INK = "#161616";
const MUTED = "#5a5a5a";
const LINE = "#e3ded4";
const IVORY = "#F7F4EE";

const longDay = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "";

export const invoiceFileName = (inv) =>
  `${invoiceNumber(inv.invoice_no)} ${inv.property_address || inv.bill_to_name || ""}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") + ".pdf";

// Renders one invoice (from invoice_doc) as a branded PDF. Returns a Buffer.
export function invoicePdf(inv) {
  const no = invoiceNumber(inv.invoice_no);
  const pdf = createPdf({ title: `${SITE.name} ${no}`, author: SITE.name });
  const M = 54;
  const R = pdf.width - M;
  let y = 0;

  const newPage = () => {
    pdf.addPage();
    pdf.rect(0, 0, pdf.width, 6, { fill: RED });
    y = 48;
  };
  const room = (h) => {
    if (y + h > pdf.height - 72) newPage();
  };

  newPage();
  // Letterhead
  pdf.text("IREP", M, y + 14, { size: 22, font: "bold", color: RED });
  pdf.text("PROPERTY MANAGEMENT", M, y + 28, { size: 7.5, font: "bold", color: INK });
  const office = [SITE.name, SITE.address, SITE.phone, SITE.email, SITE.hstNumber ? `HST No. ${SITE.hstNumber}` : ""].filter(Boolean);
  office.forEach((l, i) => pdf.text(l, R, y + 6 + i * 12, { size: 8.5, color: MUTED, align: "right" }));
  y += Math.max(44, office.length * 12 + 10);
  pdf.line(M, y, R, y, { color: LINE });
  y += 34;

  pdf.text(inv.status === "void" ? "Invoice (Void)" : "Invoice", M, y, { size: 26, font: "serif", color: INK });
  y += 22;

  // Meta: left column bill-to, right column invoice details
  const top = y;
  pdf.text("BILL TO", M, y, { size: 7.5, font: "bold", color: MUTED });
  y += 14;
  pdf.text(inv.bill_to_name || "", M, y, { size: 10.5, font: "bold" });
  y += 13;
  for (const l of inv.bill_to_address ? wrap(inv.bill_to_address, 9.5, 230) : []) {
    pdf.text(l, M, y, { size: 9.5, color: MUTED });
    y += 12;
  }
  if (inv.bill_to_email) {
    pdf.text(inv.bill_to_email, M, y, { size: 9.5, color: MUTED });
    y += 12;
  }
  if (inv.property_address) {
    y += 6;
    pdf.text("PROPERTY", M, y, { size: 7.5, font: "bold", color: MUTED });
    y += 13;
    for (const l of wrap(inv.property_address, 9.5, 230)) {
      pdf.text(l, M, y, { size: 9.5 });
      y += 12;
    }
  }
  const leftEnd = y;

  const meta = [
    ["Invoice", no],
    ["Date", longDay(inv.issue_date)],
    ...(inv.due_date ? [["Due", longDay(inv.due_date)]] : [["Due", "On receipt"]]),
    ...(inv.status === "paid" ? [["Paid", longDay(inv.paid_on)]] : []),
  ];
  let my = top;
  const labelX = R - 190;
  for (const [k, v] of meta) {
    pdf.text(k, labelX, my, { size: 9, color: MUTED });
    pdf.text(v, R, my, { size: 9.5, font: k === "Invoice" ? "bold" : "regular", align: "right" });
    my += 15;
  }
  // Amount due box
  my += 4;
  pdf.rect(labelX - 8, my - 4, R - labelX + 8, 34, { fill: IVORY });
  pdf.text(inv.status === "paid" ? "Amount paid" : inv.status === "void" ? "Amount (void)" : "Amount due", labelX, my + 17, { size: 9, color: MUTED });
  pdf.text(money(inv.total), R - 6, my + 18, { size: 14, font: "bold", color: inv.status === "void" ? MUTED : INK, align: "right" });
  my += 38;

  y = Math.max(leftEnd, my) + 22;

  // Title and description
  if (inv.title) {
    pdf.text(inv.title, M, y, { size: 15, font: "serif" });
    y += 16;
  }
  for (const l of inv.description ? wrap(inv.description, 9.5, R - M) : []) {
    room(14);
    pdf.text(l, M, y, { size: 9.5, color: INK });
    y += 13;
  }
  y += 10;

  // Line items
  const cQty = R - 210;
  const cPrice = R - 110;
  const header = () => {
    pdf.line(M, y, R, y, { color: INK, width: 1 });
    y += 13;
    pdf.text("DESCRIPTION", M, y, { size: 7.5, font: "bold", color: MUTED });
    pdf.text("QTY", cQty, y, { size: 7.5, font: "bold", color: MUTED, align: "right" });
    pdf.text("UNIT PRICE", cPrice, y, { size: 7.5, font: "bold", color: MUTED, align: "right" });
    pdf.text("AMOUNT", R, y, { size: 7.5, font: "bold", color: MUTED, align: "right" });
    y += 8;
    pdf.line(M, y, R, y, { color: LINE });
    y += 15;
  };
  header();
  for (const l of inv.lines || []) {
    const desc = wrap(l.description, 9.5, cQty - M - 50);
    const h = desc.length * 12 + (l.taxable ? 0 : 11) + 10;
    if (y + h > pdf.height - 72) {
      newPage();
      header();
    }
    desc.forEach((d, i) => pdf.text(d, M, y + i * 12, { size: 9.5 }));
    if (!l.taxable) pdf.text("No HST", M, y + desc.length * 12, { size: 8, color: MUTED });
    pdf.text(qtyText(l.quantity), cQty, y, { size: 9.5, align: "right" });
    pdf.text(money(l.unit_price), cPrice, y, { size: 9.5, align: "right" });
    pdf.text(money(l.amount), R, y, { size: 9.5, align: "right" });
    y += h - 6;
    pdf.line(M, y, R, y, { color: LINE });
    y += 15;
  }

  // Totals
  room(70);
  const tl = R - 190;
  const totalRow = (label, value, strong) => {
    if (strong) {
      pdf.line(tl, y - 10, R, y - 10, { color: INK, width: 1 });
      y += 3;
    }
    pdf.text(label, tl, y, { size: strong ? 10.5 : 9.5, font: strong ? "bold" : "regular", color: strong ? INK : MUTED });
    pdf.text(value, R, y, { size: strong ? 11 : 9.5, font: strong ? "bold" : "regular", align: "right" });
    y += strong ? 18 : 15;
  };
  totalRow("Subtotal", money(inv.subtotal));
  totalRow(`HST (${Number(inv.hst_percent)}%)`, money(inv.hst));
  totalRow("Total (CAD)", money(inv.total), true);
  if (inv.status === "paid") {
    const how = [PAID_METHODS[inv.paid_method] || "", inv.paid_reference || ""].filter(Boolean).join(", ");
    pdf.text(`Paid ${longDay(inv.paid_on)}${how ? ` (${how})` : ""}. Thank you.`, R, y + 2, { size: 9, color: RED, font: "bold", align: "right" });
    y += 16;
  }
  y += 14;

  // Notes / payment instructions
  if (inv.notes && inv.status !== "paid") {
    const lines = wrap(inv.notes, 9.5, R - M - 24);
    room(lines.length * 13 + 30);
    pdf.rect(M, y - 4, R - M, lines.length * 13 + 26, { fill: IVORY });
    pdf.text("PAYMENT", M + 12, y + 10, { size: 7.5, font: "bold", color: MUTED });
    lines.forEach((l, i) => pdf.text(l, M + 12, y + 24 + i * 13, { size: 9.5 }));
    y += lines.length * 13 + 36;
  }
  if (inv.status === "void" && inv.void_reason) {
    room(30);
    pdf.text(`This invoice was voided: ${inv.void_reason}`, M, y, { size: 9.5, color: MUTED });
    y += 16;
  }

  // Footer on the last page
  const fy = pdf.height - 40;
  pdf.line(M, fy - 14, R, fy - 14, { color: LINE });
  const foot = `Questions? Call ${SITE.phone} or email ${SITE.email}.`;
  pdf.text(foot, pdf.width / 2, fy, { size: 8.5, color: MUTED, align: "center" });
  return pdf.toBuffer();
}
