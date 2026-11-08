import "server-only";
import { escapeHtml } from "@/lib/staff-alerts";
import { money } from "@/lib/format";
import { shortDate } from "@/lib/rent";
import { SITE } from "@/lib/site";
import { invoiceNumber } from "@/lib/work-order-invoice";

const RED = "#B41710";
const INK = "#161616";
const IVORY = "#F7F4EE";
const LINE = "#e3ded4";

export const invoiceUrl = (id) => `https://ireppm.ca/owner/work-orders/${encodeURIComponent(id)}`;

const qty = (n) => (Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(2));

// The itemized work-order invoice as an email to the landlord.
export function workOrderInvoiceEmail(inv, ownerName, ownerEmail, message) {
  const no = invoiceNumber(inv.invoice_no);
  const place = [inv.address, inv.city, inv.postal_code].filter(Boolean).join(", ");
  const unit = inv.unit && inv.unit !== "Whole property" && !/^Other \(/.test(inv.unit) ? inv.unit : "";
  const lines = Array.isArray(inv.lines) ? inv.lines : [];
  const name = ownerName || "there";
  const owner = inv.charge_to === "owner";
  const note = String(message || "").trim();
  const deducted = owner
    ? "This amount is deducted from your monthly rent payout, so nothing needs to be paid separately."
    : "This work wasn't charged to you; it's shown for your records.";

  const cell = `padding:8px 6px;border-bottom:1px solid ${LINE};font-size:14px;vertical-align:top;`;
  const rows = lines
    .map(
      (l) => `<tr>
        <td style="${cell}">${escapeHtml(l.description)}${l.taxable ? "" : `<br><span style="color:#777;font-size:12px;">No HST</span>`}</td>
        <td style="${cell}text-align:right;">${escapeHtml(qty(l.quantity))}</td>
        <td style="${cell}text-align:right;">${escapeHtml(money(l.unit_price))}</td>
        <td style="${cell}text-align:right;">${escapeHtml(money(l.amount))}</td>
      </tr>`
    )
    .join("");
  const total = (label, value, strong) =>
    `<tr><td colspan="3" style="padding:6px;text-align:right;font-size:14px;${strong ? `font-weight:700;border-top:2px solid ${INK};` : ""}">${escapeHtml(label)}</td><td style="padding:6px;text-align:right;font-size:14px;${strong ? `font-weight:700;border-top:2px solid ${INK};` : ""}">${escapeHtml(value)}</td></tr>`;

  const html = `<!doctype html>
<html lang="en-CA">
  <body style="margin:0;padding:0;background:${IVORY};font-family:'Libre Franklin',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-top:4px solid ${RED};">
          <tr><td style="padding:28px 32px 8px;color:${INK};font-size:15px;line-height:1.55;">
            <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;color:${RED};font-weight:600;">IREP PROPERTY MANAGEMENT</p>
            <h1 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;">Work Order Invoice ${escapeHtml(no)}</h1>
            <p style="margin:0 0 12px;">Hi ${escapeHtml(name)},</p>
            ${note ? `<p style="margin:0 0 12px;white-space:pre-line;">${escapeHtml(note)}</p>` : `<p style="margin:0 0 12px;">Here is the invoice for work completed at ${escapeHtml(inv.address)}.</p>`}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;font-size:14px;">
              <tr>
                <td style="padding:2px 0;color:#555;width:110px;">Invoice</td><td style="padding:2px 0;">${escapeHtml(no)}</td>
              </tr>
              <tr>
                <td style="padding:2px 0;color:#555;">Date</td><td style="padding:2px 0;">${escapeHtml(inv.completed_on ? shortDate(inv.completed_on) : "—")}</td>
              </tr>
              <tr>
                <td style="padding:2px 0;color:#555;">Property</td><td style="padding:2px 0;">${escapeHtml(place)}${unit ? `, ${escapeHtml(unit)}` : ""}</td>
              </tr>
            </table>
            <h2 style="margin:0 0 6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;">${escapeHtml(inv.title)}</h2>
            ${inv.description ? `<p style="margin:0 0 12px;white-space:pre-line;">${escapeHtml(inv.description)}</p>` : ""}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 4px;">
              <tr>
                <th style="padding:6px;text-align:left;font-size:12px;color:#555;border-bottom:1px solid ${LINE};">Item</th>
                <th style="padding:6px;text-align:right;font-size:12px;color:#555;border-bottom:1px solid ${LINE};">Qty</th>
                <th style="padding:6px;text-align:right;font-size:12px;color:#555;border-bottom:1px solid ${LINE};">Unit price</th>
                <th style="padding:6px;text-align:right;font-size:12px;color:#555;border-bottom:1px solid ${LINE};">Amount</th>
              </tr>
              ${rows}
              ${total("Subtotal", money(inv.subtotal))}
              ${total(`HST (${Number(inv.hst_percent)}%)`, money(inv.hst))}
              ${total("Total", money(inv.total), true)}
            </table>
            ${inv.notes ? `<p style="margin:12px 0 0;padding:12px 16px;background:${IVORY};white-space:pre-line;">${escapeHtml(inv.notes)}</p>` : ""}
            <p style="margin:16px 0 0;">${escapeHtml(deducted)}</p>
          </td></tr>
          <tr><td style="padding:16px 32px 8px;">
            <a href="${escapeHtml(invoiceUrl(inv.id))}" style="display:inline-block;background:${RED};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;">View or save as PDF</a>
          </td></tr>
          <tr><td style="padding:12px 32px 28px;color:#5a5a5a;font-size:13px;line-height:1.5;">
            <p style="margin:0 0 8px;">Sign in to your landlord portal with ${escapeHtml(ownerEmail)} to view it.</p>
            <p style="margin:0;">Questions? Reply to this email or call ${escapeHtml(SITE.phone)}.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hi ${name},`,
    "",
    note || `Here is the invoice for work completed at ${inv.address}.`,
    "",
    `Invoice ${no}${inv.completed_on ? ` · ${shortDate(inv.completed_on)}` : ""}`,
    `Property: ${place}${unit ? `, ${unit}` : ""}`,
    "",
    inv.title,
    inv.description || "",
    "",
    ...lines.map((l) => `${l.description}: ${qty(l.quantity)} × ${money(l.unit_price)} = ${money(l.amount)}${l.taxable ? "" : " (no HST)"}`),
    "",
    `Subtotal ${money(inv.subtotal)}`,
    `HST (${Number(inv.hst_percent)}%) ${money(inv.hst)}`,
    `Total ${money(inv.total)}`,
    inv.notes ? `\n${inv.notes}` : "",
    "",
    deducted,
    "",
    `View or save as PDF: ${invoiceUrl(inv.id)}`,
    `Questions? Reply to this email or call ${SITE.phone}.`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { subject: `Invoice ${no}: ${inv.title}, ${inv.address}`, html, text };
}
