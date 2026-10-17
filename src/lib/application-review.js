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

// Plain branded email: a few paragraphs and one button.
export async function sendMail({ to, subject, lines, link, linkLabel, replyTo }) {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!process.env.RESEND_API_KEY || !list.length) return { skipped: true };
  const body = lines.filter(Boolean);
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#161616;max-width:560px">
${body.map((l) => `<p style="margin:0 0 12px;white-space:pre-line">${escapeHtml(l)}</p>`).join("")}
${link ? `<p style="margin:20px 0"><a href="${link}" style="background:#B41710;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;display:inline-block">${escapeHtml(linkLabel || "Open")}</a></p>` : ""}
<p style="margin:24px 0 0;font-size:13px;color:#5e5852">${escapeHtml(SITE.name)} · ${escapeHtml(SITE.phone)} · ${escapeHtml(SITE.email)}</p></div>`;
  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM,
      to: list,
      replyTo: replyTo || SITE.email,
      subject,
      html,
      text: `${body.join("\n\n")}${link ? `\n\n${linkLabel || "Open"}: ${link}` : ""}`,
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
