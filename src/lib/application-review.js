import "server-only";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/staff-alerts";
import { SITE } from "@/lib/site";

// Shared helpers for the landlord application review (see migration 0025).

const FROM = "IRep Property Management <alerts@ireppm.ca>";
export const SITE_URL = "https://ireppm.ca";

export function bearer(request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

// A Supabase client that acts as the signed-in person, so database checks (auth.uid())
// decide what they may see or do.
export function userClient(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function staffEmails() {
  return (process.env.STAFF_ALERT_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
}

// One paragraph: a short lead-in like "Rent:" is set in bold, and "• " lines become a list.
function paragraphHtml(line) {
  const parts = String(line).split("\n");
  const out = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length)
      out.push(`<ul style="margin:6px 0 0;padding-left:20px;">${bullets.map((b) => `<li style="margin:0 0 4px;">${escapeHtml(b)}</li>`).join("")}</ul>`);
    bullets = [];
  };
  for (const p of parts) {
    if (p.startsWith("• ")) bullets.push(p.slice(2));
    else {
      flush();
      const m = p.match(/^([A-Z][A-Za-z' &]{1,24}):\s(.*)$/);
      out.push(m ? `<b>${escapeHtml(m[1])}:</b> ${escapeHtml(m[2])}` : escapeHtml(p));
    }
  }
  flush();
  return `<div style="margin:0 0 14px;">${out.join("<br>").replace(/<br>(<ul)/g, "$1").replace(/(<\/ul>)<br>/g, "$1")}</div>`;
}

// A button that shows in every mail app (Gmail and Outlook drop styling on a bare link),
// with the address written out underneath in case the button is blocked.
export function emailButton(href, label) {
  const h = escapeHtml(href);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 8px;"><tr>
<td bgcolor="#B41710" style="background:#B41710;border-radius:3px;"><a href="${h}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(label)} &rarr;</a></td>
</tr></table>
<p style="margin:0 0 6px;font-size:12px;color:#6b6b6b;">Or open this link: <a href="${h}" style="color:#B41710;word-break:break-all;">${h}</a></p>`;
}

function brandedHtml(body, link, linkLabel) {
  return `<!doctype html><html lang="en-CA"><body style="margin:0;padding:0;background:#F7F4EE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EE;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-top:4px solid #B41710;">
<tr><td style="padding:24px 32px 4px;"><p style="margin:0;font-family:Arial,sans-serif;font-size:12px;letter-spacing:.12em;color:#B41710;font-weight:700;">IREP PROPERTY MANAGEMENT</p></td></tr>
<tr><td style="padding:12px 32px 8px;font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#161616;">
${body.map(paragraphHtml).join("\n")}
${link ? emailButton(link, linkLabel || "Open") : ""}
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #E6E1D8;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#6b6b6b;">
${escapeHtml(SITE.name)}<br>${escapeHtml(SITE.address || "")}<br>${escapeHtml(SITE.phone)} · <a href="mailto:${SITE.email}" style="color:#6b6b6b;">${escapeHtml(SITE.email)}</a> · <a href="${SITE.url}" style="color:#6b6b6b;">ireppm.ca</a>
</td></tr></table></td></tr></table></body></html>`;
}

// Branded email: a few paragraphs and one button.
export async function sendMail({ to, subject, lines, link, linkLabel, replyTo, attachments }) {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!process.env.RESEND_API_KEY || !list.length) return { skipped: true };
  const body = lines.filter(Boolean);
  const html = brandedHtml(body, link, linkLabel);
  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM,
      to: list,
      replyTo: replyTo || SITE.email,
      subject,
      html,
      text: `${body.join("\n\n")}${link ? `\n\n${linkLabel || "Open"}: ${link}` : ""}`,
      ...(attachments?.length ? { attachments } : {}),
    });
    if (error) console.error("[applications] email failed:", error.message || error);
    return { sent: !error };
  } catch (err) {
    console.error("[applications] email failed:", err?.message || err);
    return { sent: false };
  }
}

export const placeOf = (listing) => [listing?.address, listing?.unit].filter(Boolean).join(", ") || "the property";

// Everything a notification needs about one application (service-role read).
export async function loadApplication(admin, id) {
  const { data } = await admin
    .from("applications")
    .select("id, user_id, applicant_name, applicant_email, owner_id, owner_review_status, status, documents, credit_report_path, listing:listings(address, unit), owner:owners(id, name, email)")
    .eq("id", id)
    .maybeSingle();
  return data;
}
