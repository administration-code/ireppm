import "server-only";

// DocuSign plan: 100 envelopes sent through the API per license year, renewing Oct 28.
export const DOCUSIGN_LIMIT = 100;
export const DOCUSIGN_WARN = [80, 95];
const RENEWS = { month: 10, day: 28 };

const torontoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

// The start of the current license year (the last Oct 28 on or before today).
export function licenseYearStart(today = torontoToday()) {
  const y = Number(today.slice(0, 4));
  const thisYear = `${y}-${String(RENEWS.month).padStart(2, "0")}-${String(RENEWS.day).padStart(2, "0")}`;
  return today >= thisYear ? thisYear : `${y - 1}-${thisYear.slice(5)}`;
}

export async function docusignUsage(sb) {
  const start = licenseYearStart();
  const { count, error } = await sb.from("docusign_sends").select("envelope_id", { count: "exact", head: true }).gte("sent_at", `${start}T00:00:00-05:00`);
  if (error) return null;
  return { used: count || 0, limit: DOCUSIGN_LIMIT, start };
}

// Records one envelope the portal just sent through the API, and emails staff the first time the
// year's count reaches 80 or 95. Never throws.
export async function recordSend(envelopeId) {
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    const sb = getSupabaseAdmin();
    const { data: req } = await sb.from("signature_requests").select("id, kind, title").eq("envelope_id", envelopeId).maybeSingle();
    const { error } = await sb
      .from("docusign_sends")
      .insert({ envelope_id: envelopeId, source: "api", signature_request_id: req?.id || null, kind: req?.kind || null, title: req?.title || null });
    if (error) return; // already counted, or before migration 0102
    const u = await docusignUsage(sb);
    if (!u) return;
    const hit = [...DOCUSIGN_WARN].reverse().find((t) => u.used >= t);
    if (!hit) return;
    const { error: once } = await sb.from("docusign_usage_alerts").insert({ license_year: u.start, threshold: hit });
    if (once) return; // already warned at this level
    const { mailer, mailConfigured } = await import("@/lib/mailer");
    const to = (process.env.STAFF_ALERT_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!mailConfigured() || !to.length) return;
    const left = Math.max(0, u.limit - u.used);
    await mailer().emails.send({
      from: "IRep Property Management <alerts@ireppm.ca>",
      to,
      subject: `${hit >= 95 ? "URGENT: " : ""}DocuSign sends: ${u.used}/${u.limit} this license year`,
      text: `The portal has sent ${u.used} of ${u.limit} DocuSign envelopes allowed this license year (since ${u.start}). ${left} left until the plan renews on Oct 28.${hit >= 95 ? " Once the limit is reached, new leases, notices and certificates can't be sent: check the plan with DocuSign now." : " Keep an eye on it."}`,
    });
  } catch (err) {
    console.error("[docusign-usage] record failed:", err?.message || err);
  }
}
