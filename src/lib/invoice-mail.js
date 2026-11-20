import "server-only";
import { escapeHtml } from "@/lib/staff-alerts";
import { SITE } from "@/lib/site";
import { amount, invoiceNumber, qtyText } from "@/lib/invoices";

const RED = "#B41710";
const INK = "#161616";
const IVORY = "#F7F4EE";
const LINE = "#e3ded4";

const longDay = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "";

// The invoice email: a short note, the summary and lines, and the PDF attached.
export function invoiceEmail(inv, { message, portal } = {}) {
  const no = invoiceNumber(inv.invoice_no);
  const first = String(inv.bill_to_name || "").split(" ")[0] || "there";
  const note = String(message || "").trim();
  const intro = note || `Please find attached invoice ${no}${inv.property_address ? ` for ${inv.property_address}` : ""}.`;
  const due = inv.due_date ? `Due ${longDay(inv.due_date)}` : "Due on receipt";
  const cell = `padding:8px 6px;border-bottom:1px solid ${LINE};font-size:14px;vertical-align:top;`;
  const rows = (inv.lines || [])
    .map(
      (l) => `<tr><td style="${cell}">${escapeHtml(l.description)}${l.taxable ? "" : `<br><span style="color:#777;font-size:12px;">No HST</span>`}</td>
        <td style="${cell}text-align:right;">${escapeHtml(qtyText(l.quantity))}</td>
        <td style="${cell}text-align:right;">${escapeHtml(amount(l.amount))}</td></tr>`
    )
    .join("");
  const tot = (label, value, strong) =>
    `<tr><td colspan="2" style="padding:6px;text-align:right;font-size:14px;${strong ? `font-weight:700;border-top:2px solid ${INK};` : ""}">${escapeHtml(label)}</td><td style="padding:6px;text-align:right;font-size:14px;${strong ? `font-weight:700;border-top:2px solid ${INK};` : ""}">${escapeHtml(value)}</td></tr>`;

  const html = `<!doctype html>
<html lang="en-CA"><body style="margin:0;padding:0;background:${IVORY};font-family:'Libre Franklin',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-top:4px solid ${RED};">
<tr><td style="padding:28px 32px 8px;color:${INK};font-size:15px;line-height:1.55;">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;color:${RED};font-weight:600;">IREP PROPERTY MANAGEMENT</p>
  <h1 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;">Invoice ${escapeHtml(no)}</h1>
  <p style="margin:0 0 12px;">Hi ${escapeHtml(first)},</p>
  <p style="margin:0 0 16px;white-space:pre-line;">${escapeHtml(intro)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:${IVORY};"><tr>
    <td style="padding:14px 16px;font-size:14px;">${escapeHtml(inv.title || "Invoice")}<br><span style="color:#555;">${escapeHtml(due)}</span></td>
    <td style="padding:14px 16px;text-align:right;font-size:22px;font-weight:700;">${escapeHtml(amount(inv.total))}</td>
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px;">
    <tr><th style="padding:6px;text-align:left;font-size:12px;color:#555;border-bottom:1px solid ${LINE};">Item</th>
        <th style="padding:6px;text-align:right;font-size:12px;color:#555;border-bottom:1px solid ${LINE};">Qty</th>
        <th style="padding:6px;text-align:right;font-size:12px;color:#555;border-bottom:1px solid ${LINE};">Amount</th></tr>
    ${rows}
    ${tot("Subtotal", amount(inv.subtotal))}
    ${tot(`HST (${Number(inv.hst_percent)}%)`, amount(inv.hst))}
    ${tot("Total (CAD)", amount(inv.total), true)}
  </table>
  ${inv.notes ? `<p style="margin:12px 0 0;padding:12px 16px;background:${IVORY};white-space:pre-line;">${escapeHtml(inv.notes)}</p>` : ""}
  <p style="margin:16px 0 0;">The invoice is attached as a PDF${portal ? " and is also in your landlord portal" : ""}.</p>
</td></tr>
${portal ? `<tr><td style="padding:12px 32px 4px;"><a href="${SITE.url}/owner" style="display:inline-block;background:${RED};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;">Open Your Owner Portal</a></td></tr>` : ""}
<tr><td style="padding:12px 32px 28px;color:#5a5a5a;font-size:13px;line-height:1.5;">
  <p style="margin:0;">Questions? Reply to this email or call ${escapeHtml(SITE.phone)}.</p>
  <p style="margin:8px 0 0;">${escapeHtml(SITE.name)} · ${escapeHtml(SITE.address)}${SITE.hstNumber ? ` · HST No. ${escapeHtml(SITE.hstNumber)}` : ""}</p>
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Hi ${first},`,
    "",
    intro,
    "",
    `Invoice ${no} · ${inv.title || "Invoice"} · ${due}`,
    ...(inv.lines || []).map((l) => `${l.description}: ${amount(l.amount)}${l.taxable ? "" : " (no HST)"}`),
    `Subtotal ${amount(inv.subtotal)}`,
    `HST (${Number(inv.hst_percent)}%) ${amount(inv.hst)}`,
    `Total ${amount(inv.total)}`,
    inv.notes ? `\n${inv.notes}` : "",
    "",
    "The invoice is attached as a PDF.",
    `Questions? Reply to this email or call ${SITE.phone}.`,
  ].join("\n");

  return {
    subject: `Invoice ${no} from ${SITE.name}${inv.property_address ? `: ${inv.property_address}` : ""}`,
    html,
    text,
  };
}
