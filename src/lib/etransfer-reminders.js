import "server-only";
import { mailer, mailConfigured } from "@/lib/mailer";
import { escapeHtml } from "@/lib/staff-alerts";
import { money } from "@/lib/format";
import { SITE } from "@/lib/site";

export const OLD_ADDRESS = "ireppm@ireprealty.com";
export const isOldAddress = (to) => /ireprealty\.com/i.test(String(to || ""));
const FROM = "IRep Property Management <administration@ireppm.ca>";
const BANNER = `URGENT: ${OLD_ADDRESS} does NOT accept rent payments. Send all rent to ${SITE.paymentEmail}.`;
export const URGENT_SUBJECT = "URGENT: Your rent was sent to the wrong e-Transfer address";

const longDate = (iso) =>
  new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

// The moment an e-Transfer to the old address is seen (deposited or pending), every time: an URGENT
// email to the tenants on the tenancy, from administration@ with administration@ copied, logged on
// their Communications timeline and listed on the Today page ("Paid to old address").
// Never replies to or forwards the Interac email itself.
export async function urgentOldAddress(sb, { tenancyId, amount, receivedOn, pending, reference }) {
  if (!tenancyId || !mailConfigured()) return { sent: false };
  const { data: t } = await sb
    .from("tenancies")
    .select("id, unit_id, rent_due_day, tenancy_tenants(full_name, email, is_primary), unit:units(label, property_id, property:properties(address))")
    .eq("id", tenancyId)
    .maybeSingle();
  if (!t) return { sent: false };
  const to = [...new Set((t.tenancy_tenants || []).map((p) => String(p.email || "").trim().toLowerCase()).filter(Boolean))];
  if (!to.length) return { sent: false, skipped: "no tenant email" };
  const first = (t.tenancy_tenants || []).map((p) => String(p.full_name || "").split(" ")[0]).filter(Boolean).join(" and ") || "there";
  const place = [t.unit?.property?.address, t.unit?.label].filter(Boolean).join(", ");
  const due = `the ${ordinal(Number(t.rent_due_day) || 1)} of the month`;
  const when = receivedOn ? longDate(receivedOn) : "recently";

  const lines = [
    `Hi ${first},`,
    pending
      ? `Your e-Transfer of ${money(amount)} on ${when} for ${place} was sent to our old address, ${OLD_ADDRESS}. That address does not accept rent payments, and this payment will not be accepted.`
      : `Your e-Transfer of ${money(amount)} on ${when} for ${place} was sent to our old address, ${OLD_ADDRESS}. That address does not accept rent payments, and payments sent there will not be accepted.`,
    pending
      ? `Because it's still pending, please cancel it through your bank and resend it to ${SITE.paymentEmail} right away.`
      : `If any other payment to that address is still pending, please cancel it through your bank and resend it to ${SITE.paymentEmail} right away.`,
    `Please update IRep's e-Transfer contact in your banking to ${SITE.paymentEmail}. Payments sent there are deposited automatically, with no security question.`,
    `Rent that isn't received at ${SITE.paymentEmail} by the due date (${due}) is unpaid. Unpaid rent can result in an N4 notice (non-payment of rent), which can lead to an application to the Landlord and Tenant Board to end the tenancy.`,
    "Please reply to this email to confirm you've updated the address.",
    "Thank you,\nIRep Property Management",
  ];
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#161616;max-width:600px">
<div style="background:#B41710;color:#ffffff;font-weight:800;font-size:22px;line-height:1.35;padding:18px 20px;border-radius:4px;margin:0 0 20px">${escapeHtml(BANNER)}</div>
${lines.map((l) => `<p style="margin:0 0 12px;white-space:pre-line">${escapeHtml(l)}</p>`).join("")}
</div>`;
  const text = [BANNER, "", ...lines].join("\n\n");
  const { error } = await mailer().emails.send({ from: FROM, to, cc: [SITE.email], replyTo: SITE.email, subject: URGENT_SUBJECT, html, text });
  if (error) {
    console.error("[etransfer-urgent] failed:", error.message || error);
    return { sent: false };
  }
  const reason = `${pending ? "Pending" : "Deposited"} ${money(amount)} on ${String(receivedOn || "").slice(0, 10)} to ${OLD_ADDRESS}${reference ? ` (ref ${reference})` : ""}`;
  await sb.from("etransfer_address_reminders").insert({ tenancy_id: tenancyId, sent_to: to.join(", "), reason });

  // Communications timeline (linked to its Gmail copy when the mail feed sees it).
  const row = {
    message_id: `pre-urgent-${reference || Date.now()}`,
    direction: "out",
    from_name: "IRep Property Management",
    from_email: SITE.email,
    to_emails: [...to, SITE.email],
    subject: URGENT_SUBJECT,
    snippet: text.slice(0, 1500),
    body: text.slice(0, 8000),
    received_at: new Date().toISOString(),
    status: "handled",
    via_portal: true,
    party_kind: "tenant",
    tenancy_id: t.id,
    unit_id: t.unit_id,
    property_id: t.unit?.property_id || null,
    category: "rent",
    label_source: "rule",
  };
  const { error: logErr } = await sb.from("inbound_emails").insert(row);
  if (logErr && /via_portal/.test(logErr.message || "")) {
    delete row.via_portal;
    await sb.from("inbound_emails").insert(row);
  }
  return { sent: true, to };
}

// Old-address e-Transfers in the last 14 days for the Today page: tenants emailed, and ones that
// couldn't be matched (waiting in To Match).
export async function oldAddressToday(sb) {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [{ data: emailed }, { data: pend }, { data: paid }] = await Promise.all([
    sb
      .from("etransfer_address_reminders")
      .select("sent_at, reason, tenancy:tenancies(unit:units(label, property:properties(address)), tenancy_tenants(full_name, is_primary))")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false }),
    sb.from("etransfer_pending").select("amount, payer_name, created_at").is("tenancy_id", null).eq("status", "open").gte("created_at", since),
    sb.from("payments").select("amount, payer_name, received_on").eq("status", "unmatched").ilike("sent_to", "%ireprealty%").gte("created_at", since),
  ]);
  const who = (t) =>
    [...(t?.tenancy_tenants || [])]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((p) => p.full_name)
      .join(" & ");
  const where = (t) => [t?.unit?.property?.address, t?.unit?.label].filter(Boolean).join(", ");
  return [
    ...(emailed || []).map((r) => `${who(r.tenancy)}, ${where(r.tenancy)}: ${r.reason}. URGENT email sent ${String(r.sent_at).slice(5, 10)}; waiting for them to confirm`),
    ...(pend || []).map((p) => `NOT MATCHED: pending ${money(p.amount)} from ${p.payer_name || "unknown"} to the old address (in To Match)`),
    ...(paid || []).map((p) => `NOT MATCHED: ${money(p.amount)} from ${p.payer_name || "unknown"} to the old address (in To Match)`),
  ];
}

// Kept for the daily job: nothing to send any more (the URGENT email goes out the moment the
// payment is seen, every time).
export async function oldAddressReminders() {
  return { checked: 0, sent: 0 };
}
