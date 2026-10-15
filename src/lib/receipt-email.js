import "server-only";
import { money } from "@/lib/format";
import { SITE } from "@/lib/site";
import { METHOD_LABEL, PAYMENT_KIND_LABEL, monthLabel, shortDate } from "@/lib/rent";
import { escapeHtml } from "@/lib/staff-alerts";

const RED = "#B41710";
const INK = "#161616";
const IVORY = "#F7F4EE";

export function paymentFor(p) {
  return p.kind === "rent" ? monthLabel(p.period) : PAYMENT_KIND_LABEL[p.kind] || "Other";
}

export function receiptEmail(r) {
  const names = r.tenants.map((t) => t.full_name).join(", ") || "Tenant";
  const rows = r.payments
    .map(
      (p) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #ddd5c9;">${escapeHtml(shortDate(p.received_on))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #ddd5c9;">${escapeHtml(paymentFor(p))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #ddd5c9;">${escapeHtml(METHOD_LABEL[p.method] || p.method)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #ddd5c9;text-align:right;">${escapeHtml(money(p.amount))}</td>
      </tr>`
    )
    .join("");
  const rangeLine = r.range
    ? `<p style="margin:0 0 4px;">Payments received ${escapeHtml(shortDate(r.range.from))} to ${escapeHtml(shortDate(r.range.to))}</p>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:${IVORY};font-family:Helvetica,Arial,sans-serif;color:${INK};">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border:1px solid #ddd5c9;border-radius:4px;padding:28px;">
      <table role="presentation" width="100%" style="border-collapse:collapse;"><tr>
        <td style="vertical-align:top;">
          <div style="font-family:Georgia,serif;font-size:26px;letter-spacing:4px;font-weight:600;">IREP</div>
          <div style="font-family:Georgia,serif;font-size:10px;letter-spacing:4px;font-weight:700;border-top:2px solid ${RED};padding-top:4px;margin-top:3px;display:inline-block;">PROPERTY MANAGEMENT</div>
        </td>
        <td style="vertical-align:top;text-align:right;font-size:13px;line-height:1.5;color:#5e5852;">
          ${escapeHtml(SITE.name)}<br>${escapeHtml(SITE.address)}<br>${escapeHtml(SITE.phone)}<br>${escapeHtml(SITE.email)}
        </td>
      </tr></table>
      <h1 style="font-family:Georgia,serif;font-weight:600;font-size:28px;margin:28px 0 12px;">Rent receipt</h1>
      <div style="font-size:14px;line-height:1.6;">
        <p style="margin:0 0 4px;"><b>Receipt number:</b> ${escapeHtml(r.number)}</p>
        <p style="margin:0 0 4px;"><b>Date issued:</b> ${escapeHtml(shortDate(r.issued))}</p>
        <p style="margin:0 0 4px;"><b>Tenant:</b> ${escapeHtml(names)}</p>
        <p style="margin:0 0 4px;"><b>Rental unit:</b> ${escapeHtml(r.unitAddress)}</p>
        ${rangeLine}
      </div>
      <table width="100%" style="border-collapse:collapse;margin-top:20px;font-size:14px;">
        <thead><tr style="text-align:left;color:#5e5852;font-size:12px;text-transform:uppercase;letter-spacing:1px;">
          <th style="padding:8px 10px;border-bottom:2px solid ${INK};">Date</th>
          <th style="padding:8px 10px;border-bottom:2px solid ${INK};">For</th>
          <th style="padding:8px 10px;border-bottom:2px solid ${INK};">Method</th>
          <th style="padding:8px 10px;border-bottom:2px solid ${INK};text-align:right;">Amount</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="3" style="padding:10px;font-weight:700;">Total received</td>
          <td style="padding:10px;font-weight:700;text-align:right;">${escapeHtml(money(r.total))}</td>
        </tr></tfoot>
      </table>
      <p style="margin:24px 0 0;font-size:14px;">Received by ${escapeHtml(SITE.name)} on behalf of the landlord.</p>
    </div>
  </div></body></html>`;

  const text = [
    `${SITE.name} — Rent receipt`,
    `Receipt number: ${r.number}`,
    `Date issued: ${shortDate(r.issued)}`,
    `Tenant: ${names}`,
    `Rental unit: ${r.unitAddress}`,
    "",
    ...r.payments.map(
      (p) => `${shortDate(p.received_on)} · ${paymentFor(p)} · ${METHOD_LABEL[p.method] || p.method} · ${money(p.amount)}`
    ),
    `Total received: ${money(r.total)}`,
    "",
    `Received by ${SITE.name} on behalf of the landlord.`,
    `${SITE.address} · ${SITE.phone} · ${SITE.email}`,
  ].join("\n");

  return { subject: `Rent receipt ${r.number} — ${SITE.name}`, html, text };
}
