import "server-only";
import { loadReport, ownerReportUrl, yesNo, GUTTER, ROOF, QUOTE_CONTACT, QUOTE_DISCLAIMER, INSPECTION_DISCLAIMER, quoteTotals } from "@/lib/inspection-reports";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText, escapeHtml } from "@/lib/staff-alerts";
import { money } from "@/lib/format";
import { shortDate } from "@/lib/rent";
import { SITE } from "@/lib/site";

const unitName = (u) => (u && u !== "Whole property" ? u : "");

// Who the landlord writes to about this report: Chuck for reports he did, otherwise the office.
export const reportContact = (r) => (r?.partner_id ? r.partner?.email || QUOTE_CONTACT.email : SITE.email);

// Emails the landlord the inspection report, with Chuck's estimates when there are any, and marks it sent.
// Returns { sent, to } or { error }.
export async function sendReportToOwner(sb, id, { message = "", sentBy = null } = {}) {
  if (!mailConfigured()) return { error: "Email isn't set up yet." };
  const r = await loadReport(sb, id);
  if (!r) return { error: "Report not found." };
  const owner = r.property?.owner;
  const to = String(owner?.email || "").trim();
  if (!to) return { error: "This landlord has no email on file." };

  const hasItems = r.items.length > 0;
  const priced = r.items.some((i) => i.price != null);
  const totals = quoteTotals(r.items.map((i) => i.price));
  const contact = reportContact(r);
  const name = owner.name || "there";
  const note = String(message || "").trim().slice(0, 2000);
  const opening = note || `we inspected ${r.property.address} on ${shortDate(r.inspected_on)}.`;
  const intro = !hasItems
    ? `Hi ${name}, ${opening} We have no repairs or improvements to recommend at this time. The full report is in your landlord portal, where you can also download it as a PDF.`
    : priced
      ? `Hi ${name}, ${opening} Below are the repairs and improvements we recommend, with an estimate for each. Please approve the items you would like completed, or choose Not now, in your landlord portal. ${QUOTE_CONTACT.name} will contact you by email to schedule the approved work.`
      : `Hi ${name}, ${opening} Below are our recommended improvements. Please approve or decline each one in your landlord portal. We'll send you a price for each item you approve before any work starts.`;

  const rows = [
    ["Property", [r.property.address, r.property.city].filter(Boolean).join(", ")],
    ["Inspected", shortDate(r.inspected_on)],
    ["Furnace filter swapped", yesNo(r.furnace_filter_swapped)],
    ["Water shut-off valve set for the season", yesNo(r.water_valve_set)],
    ["Gutters", GUTTER[r.gutter_condition] || "Not checked"],
    ["Roof", ROOF[r.roof_condition] || "Not checked"],
    ["Signs of pests", r.pests ? `Yes${r.pests_note ? `: ${r.pests_note}` : ""}` : yesNo(r.pests)],
  ];

  const cell = "padding:8px 6px;border-bottom:1px solid #e3ded4;font-size:14px;vertical-align:top;";
  const itemRows = r.items
    .map((i) => {
      const where = unitName(i.unit?.label);
      return `<tr><td style="${cell}"><b>${escapeHtml(i.description)}</b>${where ? ` <span style="color:#555;">(${escapeHtml(where)})</span>` : ""}${
        i.details ? `<br><span style="color:#555;">${escapeHtml(i.details)}</span>` : ""
      }</td>${priced ? `<td style="${cell}text-align:right;white-space:nowrap;">${i.price != null ? escapeHtml(money(i.price)) : "To be priced"}</td>` : ""}</tr>`;
    })
    .join("");
  const totalRows = priced
    ? `<tr><td style="padding:6px;text-align:right;font-size:14px;">Subtotal</td><td style="padding:6px;text-align:right;font-size:14px;">${money(totals.subtotal)}</td></tr>
       <tr><td style="padding:6px;text-align:right;font-size:14px;">HST (13%)</td><td style="padding:6px;text-align:right;font-size:14px;">${money(totals.hst)}</td></tr>
       <tr><td style="padding:6px;text-align:right;font-size:16px;font-weight:600;">Estimated total</td><td style="padding:6px;text-align:right;font-size:16px;font-weight:600;">${money(totals.total)}</td></tr>`
    : "";
  const notPro = `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#555;">${escapeHtml(INSPECTION_DISCLAIMER)}</p>`;
  const extraHtml = !hasItems
    ? notPro
    : `<h2 style="margin:20px 0 8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;">${priced ? "Repairs and Improvements: Estimates" : "Recommended Improvements"}</h2>
       <table role="presentation" style="width:100%;border-collapse:collapse;">
         ${priced ? `<tr><td style="padding:6px;font-size:11px;letter-spacing:.8px;color:#555;">ITEM</td><td style="padding:6px;font-size:11px;letter-spacing:.8px;color:#555;text-align:right;">ESTIMATE (BEFORE HST)</td></tr>` : ""}
         ${itemRows}${totalRows}
       </table>
       ${priced ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#555;"><b>Disclaimer.</b> ${escapeHtml(QUOTE_DISCLAIMER)}</p>` : ""}
       ${notPro}
       <p style="margin:16px 0 0;font-size:14px;">Questions about this report or the work? Email ${escapeHtml(r.partner_id ? QUOTE_CONTACT.name : "us")} at <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>.</p>`;
  const link = { href: ownerReportUrl(id), label: hasItems ? "Approve or decline each item" : "View the inspection report" };
  const heading = hasItems ? (priced ? "Inspection Report and Estimates" : "Inspection Report and Recommended Improvements") : "Inspection Report";
  const textItems = r.items
    .map((i, n) => `${n + 1}. ${i.description}${unitName(i.unit?.label) ? ` (${unitName(i.unit?.label)})` : ""}${i.details ? `: ${i.details}` : ""}${priced ? ` - ${i.price != null ? money(i.price) : "to be priced"}` : ""}`)
    .join("\n");
  const textExtra = !hasItems
    ? intro
    : `${intro}\n\n${textItems}${
        priced ? `\n\nSubtotal: ${money(totals.subtotal)}\nHST (13%): ${money(totals.hst)}\nEstimated total: ${money(totals.total)}\n\nDisclaimer. ${QUOTE_DISCLAIMER}` : ""
      }\n\n${INSPECTION_DISCLAIMER}\n\nQuestions? Email ${contact}.`;

  const { error } = await mailer().emails.send({
    from: `IRep Property Management <${SITE.email}>`,
    to: [to],
    replyTo: [...new Set([contact, SITE.email])],
    subject: hasItems ? `${priced ? "Inspection Report and Estimates" : "Recommended Improvements"}: ${r.property.address}` : `Inspection Report: ${r.property.address}`,
    html: renderEmail({ heading, intro, rows, extraHtml, link }),
    text: renderText({ heading, rows, link, extra: textExtra }),
  });
  if (error) return { error: "The email didn't send. Try again." };

  const patch = { status: "sent", sent_at: new Date().toISOString(), sent_to: to };
  let up = await sb.from("inspection_reports").update({ ...patch, sent_by: sentBy }).eq("id", id);
  if (up.error) await sb.from("inspection_reports").update(patch).eq("id", id);
  return { sent: true, to, pending: r.items.filter((i) => i.decision === "pending").length };
}
