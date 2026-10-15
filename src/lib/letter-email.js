import "server-only";
import { escapeHtml } from "@/lib/staff-alerts";
import { money } from "@/lib/format";
import { monthLabel } from "@/lib/rent";
import { signedMoney } from "@/lib/payouts";
import { highlightsText, letterHighlights, letterProperties } from "@/lib/letters";
import { SITE } from "@/lib/site";

const RED = "#B41710";
const INK = "#161616";
const IVORY = "#F7F4EE";
const CHARCOAL = "#1B1B1B";

export const letterUrl = (id) => `https://ireppm.ca/owner/letters/${encodeURIComponent(id)}`;

function propertyLine(p) {
  const s = p.statement;
  if (!s) return { address: p.address, figures: "No statement this month" };
  return {
    address: p.address,
    figures: `rent collected ${money(s.rent_collected)}, net to you ${money(s.net_due)}, paid to you ${money(s.paid_out)}, balance ${signedMoney(s.to_pay)}`,
  };
}

export function ownerLetterEmail(letter, ownerName, ownerEmail) {
  const label = monthLabel(letter.period);
  const name = ownerName || letter.data?.owner?.name || "there";
  const lines = letterProperties(letter).map(propertyLine);
  const highlights = highlightsText(letterHighlights(letter));
  const note = String(letter.staff_note || "").trim();
  const url = letterUrl(letter.id);
  const signIn = `Sign in with ${ownerEmail} to view it. You can save it as a PDF from there.`;

  const propertyHtml = lines
    .map(
      (l) =>
        `<li style="margin:0 0 8px;"><b>${escapeHtml(l.address)}</b> — ${escapeHtml(l.figures)}</li>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="en-CA">
  <body style="margin:0;padding:0;background:${IVORY};font-family:'Libre Franklin',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-top:4px solid ${RED};">
          <tr><td style="padding:28px 32px 8px;color:${CHARCOAL};font-size:15px;line-height:1.55;">
            <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;color:${RED};font-weight:600;">IREP PROPERTY MANAGEMENT</p>
            <h1 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;color:${INK};">Your ${escapeHtml(label)} statement</h1>
            <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
            <p style="margin:0 0 12px;">Your monthly property statement for ${escapeHtml(label)} is ready.</p>
            <ul style="margin:0 0 16px;padding-left:20px;">${propertyHtml}</ul>
            <p style="margin:0 0 16px;color:#5a5a5a;font-size:14px;">${escapeHtml(highlights)}</p>
            ${note ? `<p style="margin:0 0 16px;padding:12px 16px;background:${IVORY};white-space:pre-line;">${escapeHtml(note)}</p>` : ""}
          </td></tr>
          <tr><td style="padding:8px 32px 8px;">
            <a href="${escapeHtml(url)}" style="display:inline-block;background:${RED};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;">View your full statement</a>
          </td></tr>
          <tr><td style="padding:12px 32px 28px;color:#5a5a5a;font-size:13px;line-height:1.5;">
            <p style="margin:0 0 8px;">${escapeHtml(signIn)}</p>
            <p style="margin:0;">Questions? Reply to this email or call ${escapeHtml(SITE.phone)}.</p>
          </td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#8a8579;">${escapeHtml(SITE.name)} · ${escapeHtml(SITE.address)}</p>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hi ${name},`,
    "",
    `Your monthly property statement for ${label} is ready.`,
    "",
    ...lines.map((l) => `- ${l.address}: ${l.figures}`),
    "",
    highlights,
    ...(note ? ["", note] : []),
    "",
    `View your full statement: ${url}`,
    signIn,
    "",
    `Questions? Reply to this email or call ${SITE.phone}.`,
  ].join("\n");

  return { subject: `Your ${label} property statement is ready`, html, text };
}
