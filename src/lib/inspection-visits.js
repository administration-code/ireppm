import "server-only";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { SITE } from "@/lib/site";
import { INSPECTION_DISCLAIMER } from "@/lib/inspection-reports";

// Scheduling an inspection and telling the tenants (Ontario RTA s. 27: written notice at least
// 24 hours ahead, entry between 8 am and 8 pm, with the reason and time). About an hour, common
// areas only; bedrooms only if that's the only attic access.
export const NOTICE_HOURS = 24;
export const EARLIEST_HOUR = 8; // 8 am
export const LATEST_START_HOUR = 19; // starts by 7 pm so it's done by 8 pm
const TZ = "America/Toronto";
const emailOk = (e) => /^\S+@\S+\.\S+$/.test(String(e || "").trim());

// "2026-12-03T10:00" (Toronto wall time) → a real Date.
export function torontoDate(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local || ""));
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  // Find the UTC instant whose Toronto wall time matches (handles daylight saving).
  let guess = Date.UTC(y, mo - 1, d, h + 5, mi);
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(new Date(guess))
        .map((p) => [p.type, p.value])
    );
    const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const want = Date.UTC(y, mo - 1, d, h, mi);
    if (wall === want) break;
    guess += want - wall;
  }
  return new Date(guess);
}

export const whenText = (at) =>
  new Date(at).toLocaleString("en-CA", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function scheduleProblem(at, now = new Date()) {
  if (!at) return "Pick a day and a time.";
  if (at.getTime() - now.getTime() < NOTICE_HOURS * 3600000) return "Tenants need at least 24 hours' notice. Pick a later time.";
  const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(at));
  if (hour < EARLIEST_HOUR || hour > LATEST_START_HOUR) return "Inspections have to happen between 8 am and 8 pm.";
  if (at.getTime() - now.getTime() > 90 * 86400000) return "Pick a day within the next 3 months.";
  return null;
}

// Tenants with an email on file, across every unit at the property.
export async function propertyTenantEmails(sb, propertyId) {
  const { data } = await sb
    .from("tenancy_tenants")
    .select("full_name, email, tenancy:tenancies!inner(status, unit:units!inner(property_id))")
    .eq("tenancy.unit.property_id", propertyId)
    .in("tenancy.status", ["active", "notice"]);
  const seen = new Set();
  return (data || [])
    .filter((t) => emailOk(t.email))
    .map((t) => ({ name: t.full_name, email: t.email.trim().toLowerCase() }))
    .filter((t) => (seen.has(t.email) ? false : seen.add(t.email)));
}

// One email to the office, tenants in Bcc (they don't see each other's addresses).
async function sendNotice(kind, { address, at, oldAt, inspector, tenants }) {
  if (!mailConfigured()) return { error: "Email isn't set up." };
  if (!tenants.length) return { sent: 0 };
  const when = whenText(at);
  const heading = kind === "cancelled" ? "Inspection Cancelled" : kind === "moved" ? "Inspection Moved: New Date and Time" : "Notice of Entry: Property Inspection";
  const intro =
    kind === "cancelled"
      ? `The property inspection at ${address} planned for ${whenText(oldAt)} is cancelled. We'll send a new notice before we come by.`
      : `This is written notice that IRep Property Management will enter ${address} to do a routine property inspection on ${when}${
          kind === "moved" && oldAt ? ` (moved from ${whenText(oldAt)})` : ""
        }. It should take about an hour.`;
  const rows =
    kind === "cancelled"
      ? [["Property", address]]
      : [
          ["Property", address],
          ["When", `${when}, about 1 hour`],
          ["Who", `${inspector}, IRep's maintenance contractor`],
          ["Why", "Routine twice-a-year property inspection"],
          ["Where", "Common areas (such as the kitchen, living areas, laundry, basement and utility room) and the outside. No bedrooms, unless that's the only way into the attic."],
        ];
  const extra =
    kind === "cancelled"
      ? "Please let anyone else living at the property who may not have an email on file with us know."
      : [
          "You don't need to be home.",
          "Please let anyone else living at the property who may not have an email on file with us know about this visit.",
          "If the time is a problem, reply to this email and we'll do our best to work around it.",
          INSPECTION_DISCLAIMER,
        ].join("\n\n");
  const extraHtml = extra
    .split("\n\n")
    .map((p) => `<p style="margin:12px 0 0;font-size:14px;line-height:1.5;">${p.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
    .join("");
  const subject =
    kind === "cancelled" ? `Inspection cancelled: ${address}` : `${kind === "moved" ? "New time: " : "Notice of entry: "}inspection ${when}, ${address}`;
  const { error } = await mailer().emails.send({
    from: `IRep Property Management <${SITE.email}>`,
    to: [SITE.email],
    bcc: tenants.map((t) => t.email),
    replyTo: SITE.email,
    subject,
    html: renderEmail({ heading, intro, rows, extraHtml, link: { href: "https://ireppm.ca/account", label: "Open My Tenant Portal" } }),
    text: renderText({ heading, rows, extra: `${intro}\n\n${extra}`, link: { href: "https://ireppm.ca/account", label: "Open My Tenant Portal" } }),
  });
  return error ? { error: "The notice didn't send. Try again." } : { sent: tenants.length };
}

// Schedule (or move) a property's inspection and email the tenants. Returns { visit, sent } or { error }.
export async function scheduleInspection(sb, partner, { propertyId, address, local }) {
  const at = torontoDate(local);
  const problem = scheduleProblem(at);
  if (problem) return { error: problem };
  const { data: existing, error: readErr } = await sb
    .from("inspection_visits")
    .select("id, scheduled_at")
    .eq("property_id", propertyId)
    .eq("status", "scheduled")
    .maybeSingle();
  if (readErr) return { error: "Scheduling isn't switched on yet. Tell Rosie." };
  const tenants = await propertyTenantEmails(sb, propertyId);
  const out = await sendNotice(existing ? "moved" : "new", { address, at, oldAt: existing?.scheduled_at, inspector: partner.name || "Chuck", tenants });
  if (out.error) return out;
  const row = {
    property_id: propertyId,
    partner_id: partner.id,
    scheduled_at: at.toISOString(),
    notice_sent_at: tenants.length ? new Date().toISOString() : null,
    notified: tenants.map((t) => t.email),
    updated_at: new Date().toISOString(),
  };
  const res = existing
    ? await sb.from("inspection_visits").update({ ...row, notice_count: 1 }).eq("id", existing.id).select("id").single()
    : await sb.from("inspection_visits").insert({ ...row, notice_count: 1 }).select("id").single();
  if (res.error) return { error: "That didn't save. Try again." };
  return { visit: res.data.id, sent: out.sent, noEmails: !tenants.length };
}

export async function cancelInspection(sb, partner, { visitId, address }) {
  const { data: v } = await sb.from("inspection_visits").select("id, property_id, scheduled_at, notified").eq("id", visitId).eq("status", "scheduled").maybeSingle();
  if (!v) return { error: "That visit wasn't found." };
  const tenants = (v.notified || []).map((email) => ({ email }));
  const out = await sendNotice("cancelled", { address, at: v.scheduled_at, oldAt: v.scheduled_at, inspector: partner.name, tenants });
  if (out.error) return out;
  await sb.from("inspection_visits").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", v.id);
  return { ok: true, sent: out.sent };
}

// When the report is sent: the scheduled visit for that property is done.
export async function markVisitDone(sb, propertyId, reportId) {
  await sb.from("inspection_visits").update({ status: "done", report_id: reportId, updated_at: new Date().toISOString() }).eq("property_id", propertyId).eq("status", "scheduled");
}
