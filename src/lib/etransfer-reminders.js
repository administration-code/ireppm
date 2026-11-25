import "server-only";
import { mailer, mailConfigured } from "@/lib/mailer";
import { escapeHtml } from "@/lib/staff-alerts";
import { SITE } from "@/lib/site";

export const OLD_ADDRESS = "ireppm@ireprealty.com";
export const isOldAddress = (to) => /ireprealty\.com/i.test(String(to || ""));
const GAP_DAYS = 25;
const FROM = "IRep Property Management <administration@ireppm.ca>";

// Emails the tenants on a tenancy (never the Interac email itself) asking them to send rent to
// payment@ireppm.ca instead of the old address. At most once every 25 days per tenancy.
export async function remindOldAddress(sb, tenancyId, reason = "") {
  if (!tenancyId || !mailConfigured()) return { sent: false };
  const since = new Date(Date.now() - GAP_DAYS * 86400000).toISOString();
  const { data: recent } = await sb.from("etransfer_address_reminders").select("id").eq("tenancy_id", tenancyId).gte("sent_at", since).limit(1);
  if (recent?.length) return { sent: false, skipped: "reminded in the last 25 days" };
  const { data: t } = await sb
    .from("tenancies")
    .select("id, collects_rent, tenancy_tenants(full_name, email, is_primary), unit:units(label, property:properties(address))")
    .eq("id", tenancyId)
    .maybeSingle();
  if (!t || t.collects_rent === false) return { sent: false };
  const to = [...new Set((t.tenancy_tenants || []).map((p) => String(p.email || "").trim().toLowerCase()).filter(Boolean))];
  if (!to.length) return { sent: false, skipped: "no tenant email" };
  const first = (t.tenancy_tenants || []).map((p) => String(p.full_name || "").split(" ")[0]).filter(Boolean).join(" and ") || "there";
  const place = [t.unit?.property?.address, t.unit?.label].filter(Boolean).join(", ");
  const lines = [
    `Hi ${first},`,
    `Thank you for your rent payment for ${place}. It was sent to our old e-Transfer address (${OLD_ADDRESS}), which we're phasing out.`,
    `For future payments, please send your e-Transfers to ${SITE.paymentEmail}. Payments sent there are deposited automatically, so they're recorded faster.`,
    "If you've saved us as a contact in your banking app, please update the email address there.",
    `Questions? Reply to this email or call ${SITE.phone}.`,
    "Thank you,\nIRep Property Management",
  ];
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#161616">${lines
    .map((l) => `<p style="margin:0 0 12px;white-space:pre-line">${escapeHtml(l)}</p>`)
    .join("")}</div>`;
  const { error } = await mailer().emails.send({
    from: FROM,
    to,
    replyTo: SITE.email,
    subject: `Please update our e-Transfer address: ${SITE.paymentEmail}`,
    html,
    text: lines.join("\n\n"),
  });
  if (error) {
    console.error("[etransfer-reminder] failed:", error.message || error);
    return { sent: false };
  }
  await sb.from("etransfer_address_reminders").insert({ tenancy_id: tenancyId, sent_to: to.join(", "), reason: reason || null });
  return { sent: true, to };
}

// Daily: tenants whose recent e-Transfers went to the old address (deposited ones we could match,
// and pending ones staff have tied to a tenancy) get the reminder, within the 25-day limit.
export async function oldAddressReminders(sb) {
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const [{ data: paid }, { data: pending }] = await Promise.all([
    sb.from("payments").select("tenancy_id").eq("status", "matched").ilike("sent_to", "%ireprealty%").gte("received_on", since),
    sb.from("etransfer_pending").select("tenancy_id").not("tenancy_id", "is", null).gte("created_at", since),
  ]);
  const ids = [...new Set([...(paid || []), ...(pending || [])].map((r) => r.tenancy_id).filter(Boolean))];
  let sent = 0;
  for (const id of ids) {
    const r = await remindOldAddress(sb, id, "e-Transfer sent to the old address");
    if (r.sent) sent += 1;
  }
  return { checked: ids.length, sent };
}
