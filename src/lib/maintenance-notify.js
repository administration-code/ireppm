import "server-only";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { CATEGORIES, URGENCY } from "@/lib/maintenance";
import { SITE } from "@/lib/site";
import { money } from "@/lib/format";

// When a new maintenance request is logged (by a tenant, staff or a partner), let the landlord
// know, and tell the tenants affected that it's being worked on.
// Skipped for requests logged as already completed (records of past work).

const FROM = "IRep Property Management <alerts@ireppm.ca>";
const WHOLE = "Whole property";
const isOther = (label) => /^Other \(/.test(String(label || ""));
const emailOk = (e) => /^\S+@\S+\.\S+$/.test(String(e || "").trim());

function reporterText(r) {
  if (r.source === "tenant_portal") return "Your tenant, through the tenant portal";
  if (/Agent Portal/.test(r.staff_notes || "")) return "IRep's maintenance contractor";
  return "IRep";
}

function estimateText(r, hstPct) {
  if (r.estimated_cost == null) return null;
  const est = Number(r.estimated_cost);
  const withHst = r.estimate_plus_hst ? Math.round(est * (100 + hstPct)) / 100 : est;
  return r.estimate_plus_hst ? `${money(est)} + HST (${money(withHst)})` : money(est);
}

export async function notifyLandlordAndTenants(sb, record) {
  if (!record?.id || ["completed", "cancelled"].includes(record.status)) return { skipped: true };
  if (!mailConfigured()) return { skipped: true };

  const { data: unit } = await sb
    .from("units")
    .select("id, label, property:properties(id, address, city, owner:owners(name, email))")
    .eq("id", record.unit_id)
    .maybeSingle();
  if (!unit?.property) return { skipped: true };
  const property = unit.property;
  const whole = unit.label === WHOLE;
  const other = isOther(unit.label);
  const place = whole || other ? property.address : `${property.address}, ${unit.label}`;

  const { data: rates } = await sb.from("service_rates").select("key, amount").in("key", ["hst", "owner_approval_threshold"]);
  const rate = Object.fromEntries((rates || []).map((x) => [x.key, Number(x.amount)]));
  const hstPct = rate.hst ?? 13;
  const threshold = rate.owner_approval_threshold ?? 250;

  const mail = mailer();
  const sent = { landlord: false, tenants: 0 };

  // Landlord
  const owner = property.owner;
  if (owner && emailOk(owner.email)) {
    const emergency = record.urgency === "emergency";
    const intro = emergency
      ? `An emergency repair was reported at ${place}. We're handling it right away and will update you.`
      : record.owner_approval === "pending"
        ? `A repair was reported at ${place}. It's estimated over ${money(threshold)}, so we won't go ahead without your OK. Reply to this email to approve it or ask questions.`
        : `A repair was reported at ${place}. We're arranging it now. Repairs under ${money(threshold)} go ahead without waiting for approval; anything more needs your OK first.`;
    const rows = [
      ["Property", place],
      ["Problem", record.title],
      ["Category", CATEGORIES[record.category] || record.category],
      ["Urgency", URGENCY[record.urgency] || record.urgency],
      ["Details", record.description],
      ["Estimated cost", estimateText(record, hstPct)],
      ["Reported by", reporterText(record)],
    ];
    const link = { href: "https://ireppm.ca/owner", label: "Open your landlord portal" };
    const heading = emergency ? "Emergency repair at your property" : "New maintenance request";
    const { error } = await mail.emails.send({
      from: FROM,
      to: [owner.email.trim()],
      replyTo: SITE.email,
      subject: `${emergency ? "Emergency repair" : "Maintenance request"}: ${record.title}, ${property.address}`,
      html: renderEmail({ heading, intro: `Hi ${owner.name || "there"}, ${intro}`, rows, link }),
      text: renderText({ heading, rows, link, extra: `Hi ${owner.name || "there"}, ${intro}` }),
    });
    if (error) console.error("[maintenance-notify] landlord email failed:", error.message || error.name);
    else sent.landlord = true;
  }

  // Tenants: the unit's current tenants; for shared areas and outside, everyone at the property
  // (not for routine lawn and snow work); for someone not on an IRep lease, the person who reported it.
  let recipients = [];
  if (other) {
    if (emailOk(record.reporter_email)) recipients = [{ name: record.reporter_name, email: record.reporter_email }];
  } else if (!(whole && record.category === "lawn_snow")) {
    let unitIds = [unit.id];
    if (whole) {
      const { data: units } = await sb.from("units").select("id, label").eq("property_id", property.id);
      unitIds = (units || []).filter((u) => u.label !== WHOLE && !isOther(u.label)).map((u) => u.id);
    }
    if (unitIds.length) {
      const { data: people } = await sb
        .from("tenancy_tenants")
        .select("full_name, email, tenancy:tenancies!inner(unit_id, status)")
        .in("tenancy.unit_id", unitIds)
        .in("tenancy.status", ["active", "notice"]);
      recipients = (people || []).filter((p) => emailOk(p.email)).map((p) => ({ name: p.full_name, email: p.email }));
    }
  }
  const seen = new Set();
  recipients = recipients.filter((r) => {
    const k = r.email.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const yours = record.source === "tenant_portal";
  for (const t of recipients) {
    const first = String(t.name || "").split(" ")[0] || "there";
    const intro = yours
      ? `Hi ${first}, we've received your maintenance request and we're working on it. We'll be in touch to arrange a time if we need to come in.`
      : `Hi ${first}, we've logged a maintenance item at ${whole ? "your building" : "your home"} and we're working on it. ${
          whole ? "The work is outside or in shared areas." : "We'll be in touch to arrange a time if we need to come in."
        }`;
    const rows = [
      ["Where", place],
      ["Problem", record.title],
      ["Urgency", URGENCY[record.urgency] || record.urgency],
    ];
    const extra = `Unless it's an emergency, you'll get written notice at least 24 hours before anyone enters your unit. Questions? Reply to this email or call ${SITE.phone}. Emergencies: call ${SITE.emergency.name} at ${SITE.emergency.phone}.`;
    const link = { href: "https://ireppm.ca/account", label: "Open your tenant portal" };
    const heading = "We're working on it";
    const { error } = await mail.emails.send({
      from: FROM,
      to: [t.email.trim()],
      replyTo: SITE.email,
      subject: `Maintenance: ${record.title}, ${property.address}`,
      html: renderEmail({
        heading,
        intro,
        rows,
        link,
        extraHtml: `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#3a3a3a;">${extra
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</p>`,
      }),
      text: renderText({ heading, rows, link, extra: `${intro}\n\n${extra}` }),
    });
    if (error) console.error("[maintenance-notify] tenant email failed:", error.message || error.name);
    else sent.tenants += 1;
  }
  return sent;
}
