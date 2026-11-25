import "server-only";
import { olderThanBusinessDays } from "@/lib/comms";
import { SITE_URL, placeOf, sendMail } from "@/lib/application-review";

// Targets: a decision within 2 business days of a complete application; the landlord within 1 business day.
export const DECIDE_DAYS = 2;
export const OWNER_DAYS = 1;
const OPEN = ["submitted", "reviewing"];

// Business days since a date (weekdays only), for "3 business days" labels.
export function businessDaysSince(iso, now = new Date()) {
  let n = 0;
  const cur = new Date(iso);
  while (true) {
    cur.setDate(cur.getDate() + 1);
    if (cur > now) break;
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return n;
}

// What's holding an application up, in plain words.
export function nextStep(a) {
  if (a.owner_review_status === "pending")
    return `waiting on the landlord since ${short(a.owner_review_sent_at)}${a.owner_reminder_sent_at ? ", reminded" : ""}`;
  if (a.owner_review_status === "info_requested") return "the landlord asked a question: answer it";
  if (a.owner_review_status === "approved") return "landlord approved: send the lease";
  if (a.owner_review_status === "declined") return "landlord declined: send the decline note";
  if (!a.credit_checked_at) return "credit check not done";
  if (!String(a.reference_notes || "").trim()) return "references not back: decide with what you have";
  return "ready to send to the landlord";
}
const short = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "America/Toronto" }) : "");

// Open applications past the 2-business-day target (for the Today page).
export async function lateApplications(sb) {
  const { data } = await sb
    .from("applications")
    .select("id, applicant_name, created_at, status, credit_checked_at, reference_notes, owner_review_status, owner_review_sent_at, owner_reminder_sent_at, listing:listings(address, unit)")
    .in("status", OPEN)
    .order("created_at");
  let rows = data;
  if (!rows) {
    // Before migration 0093.
    const r = await sb
      .from("applications")
      .select("id, applicant_name, created_at, status, credit_checked_at, reference_notes, owner_review_status, owner_review_sent_at, listing:listings(address, unit)")
      .in("status", OPEN)
      .order("created_at");
    rows = r.data || [];
  }
  return rows
    .filter((a) => olderThanBusinessDays(a.created_at, DECIDE_DAYS))
    .map((a) => ({ ...a, place: placeOf(a.listing), businessDays: businessDaysSince(a.created_at), step: nextStep(a) }));
}

// Daily: one reminder to a landlord who hasn't decided after 1 business day.
export async function remindOwners(sb) {
  const { data, error } = await sb
    .from("applications")
    .select("id, applicant_name, owner_review_sent_at, owner_reminder_sent_at, status, listing:listings(address, unit), owner:owners(name, email)")
    .eq("owner_review_status", "pending")
    .in("status", OPEN)
    .is("owner_reminder_sent_at", null);
  if (error) return { skipped: "migration 0093 not run" };
  let sent = 0;
  for (const a of data || []) {
    if (!a.owner?.email || !a.owner_review_sent_at || !olderThanBusinessDays(a.owner_review_sent_at, OWNER_DAYS)) continue;
    const place = placeOf(a.listing);
    const out = await sendMail({
      to: a.owner.email,
      subject: `Reminder: an applicant is waiting for your decision, ${place}`,
      lines: [
        `Hi ${String(a.owner.name || "").split(" ")[0] || "there"},`,
        `${a.applicant_name || "An applicant"} is still waiting to hear about ${place}. Their application, documents, references and credit check are ready in your owner portal.`,
        "Good applicants usually accept another place within a few days, so please approve, decline or send them a question today.",
        "If we don't hear back, we'll follow up so the unit doesn't sit empty.",
      ],
      link: `${SITE_URL}/owner/applications`,
      linkLabel: "Review the applicant",
    });
    if (out?.sent) {
      sent += 1;
      await sb.from("applications").update({ owner_reminder_sent_at: new Date().toISOString() }).eq("id", a.id);
    }
  }
  return { sent };
}
