import "server-only";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { CATEGORIES, URGENCY } from "@/lib/maintenance";
import { DEFAULT_DELIVERER } from "@/lib/lease-defaults";
import { SITE } from "@/lib/site";

const FROM = "IRep Property Management <alerts@ireppm.ca>";
const PHOTO_DAYS = 7;

// Text message through Twilio, only if it's set up (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
// TWILIO_FROM and CHUCK_SMS_TO). Without those, Chuck gets the email only.
async function sendSms(body) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: tok, TWILIO_FROM: from, CHUCK_SMS_TO: to } = process.env;
  if (!sid || !tok || !from || !to) return false;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${tok}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: from, To: to, Body: body.slice(0, 600) }),
  });
  if (!res.ok) console.error("[chuck-alert] SMS failed:", res.status);
  return res.ok;
}

// Emails Chuck (and texts him, if SMS is set up) about a new maintenance request, or one that
// was just raised to urgent or emergency: property, unit, issue, tenant contact and photo links.
export async function alertChuck(sb, record, { escalated = false } = {}) {
  if (!record?.id || ["completed", "cancelled"].includes(record.status)) return { skipped: true };
  const { data: unit } = await sb.from("units").select("label, property:properties(address, city)").eq("id", record.unit_id).maybeSingle();
  const address = unit?.property ? `${unit.property.address}${unit.property.city ? `, ${unit.property.city}` : ""}` : "Unknown property";
  let people = [];
  if (record.tenancy_id) {
    const { data } = await sb.from("tenancy_tenants").select("full_name, phone, email, is_primary").eq("tenancy_id", record.tenancy_id);
    people = (data || []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  }
  if (!people.length && (record.reporter_name || record.reporter_email || record.reporter_phone))
    people = [{ full_name: record.reporter_name, phone: record.reporter_phone, email: record.reporter_email }];
  const contact = people.map((p) => [p.full_name, p.phone, p.email].filter(Boolean).join(" · ")).join("\n") || "No tenant on file";
  const photos = [];
  for (const p of (record.photos || []).slice(0, 12)) {
    const { data } = await sb.storage.from("maintenance-photos").createSignedUrl(p.path, PHOTO_DAYS * 86400);
    if (data?.signedUrl) photos.push({ name: p.name, url: data.signedUrl });
  }
  const urgency = URGENCY[record.urgency] || record.urgency;
  const loud = record.urgency === "emergency" || record.urgency === "urgent";
  const subject = `${loud ? `${urgency.toUpperCase()}: ` : ""}${escalated ? "Raised to " + urgency + " · " : "New maintenance · "}${record.title} · ${address}`;
  const rows = [
    ["Property", address],
    ["Unit", unit?.label || "—"],
    ["Issue", record.title],
    ["Category", CATEGORIES?.[record.category] || record.category],
    ["Urgency", urgency],
    ["Tenant contact", contact],
    ["Entry", record.permission_to_enter ? "Tenant says we may enter" : "Arrange entry with the tenant"],
  ];
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const photoHtml = photos.length
    ? `<p style="margin:16px 0 4px;font-size:14px;"><b>Photos and videos</b> (links work for ${PHOTO_DAYS} days)</p><ul style="margin:0;padding-left:18px;font-size:14px;">${photos
        .map((p) => `<li><a href="${p.url}">${esc(p.name)}</a></li>`)
        .join("")}</ul>`
    : "";
  const details = record.description ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;white-space:pre-wrap;">${esc(record.description.slice(0, 1500))}</p>` : "";
  const link = { href: `https://ireppm.ca/agent`, label: "Open in the portal" };
  const sent = { email: false, sms: false };
  if (mailConfigured() && DEFAULT_DELIVERER.email) {
    const heading = escalated ? `Now ${urgency}` : "New Maintenance Request";
    const { error } = await mailer().emails.send({
      from: FROM,
      to: [DEFAULT_DELIVERER.email],
      replyTo: SITE.email,
      subject,
      html: renderEmail({ heading, intro: `Hi Chuck, ${escalated ? "this request was just raised to " + urgency.toLowerCase() : "a new request was just logged"}.`, rows, link, extraHtml: details + photoHtml }),
      text: renderText({
        heading,
        rows,
        link,
        extra: [record.description?.slice(0, 1500), photos.length ? `Photos (${PHOTO_DAYS} days):\n${photos.map((p) => `${p.name}: ${p.url}`).join("\n")}` : ""].filter(Boolean).join("\n\n"),
      }),
    });
    if (error) console.error("[chuck-alert] email failed:", error.message || error.name);
    else sent.email = true;
  }
  // Free phone notification (IRep app), unless Chuck logged it himself.
  if (String(record.reporter_email || "").toLowerCase() !== DEFAULT_DELIVERER.email.toLowerCase()) {
    const { pushTo, chuckPartnerId } = await import("@/lib/push");
    const pid = await chuckPartnerId(sb);
    const r = await pushTo(sb, { partnerId: pid }, {
      title: escalated ? `Now ${urgency}: ${record.title}` : `${loud ? `${urgency}: ` : "New job: "}${record.title}`,
      body: `${address}${unit?.label && unit.label !== "Whole property" ? ` (${unit.label})` : ""}${people[0]?.full_name ? ` · ${people[0].full_name}${people[0].phone ? ` ${people[0].phone}` : ""}` : ""}`,
      url: "/agent",
      urgent: loud,
      tag: `job-${record.id}`,
    });
    sent.push = r.sent;
  }
  sent.sms = await sendSms(
    `IRep ${loud ? urgency.toUpperCase() : "maintenance"}: ${record.title} at ${address}${unit?.label && unit.label !== "Whole property" ? ` (${unit.label})` : ""}. Tenant: ${
      people[0] ? [people[0].full_name, people[0].phone].filter(Boolean).join(" ") : "none on file"
    }. ${photos.length ? `${photos.length} photo(s) in email.` : ""}`
  ).catch(() => false);
  return sent;
}
