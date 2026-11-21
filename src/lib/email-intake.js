import "server-only";
import { aiConfigured, redact, splitMaintenanceEmail } from "@/lib/ai";

export const INTAKE_BUCKET = "maintenance-photos";

const MAINT_WORDS =
  /\b(leak\w*|flood\w*|broken|not working|doesn'?t work|repair|fix|heat|heater|furnace|boiler|no hot water|hot water|toilet|tap|faucet|sink|drain|clog\w*|mou?ld|pest|mice|mouse|rats?|cockroach\w*|bed ?bugs?|window|door|lock|roof|ceiling|outlet|power|electrical|breaker|appliance|fridge|stove|oven|washer|dryer|dishwasher|smoke detector|carbon monoxide|maintenance)\b/i;
const RENT_WORDS = /\b(rent|e-?transfer|etransfer|payment|paid|receipt|payprop|deposit|lease renewal|renew)\b/i;
const EMERGENCY = /\b(flood\w*|gas smell|smell(s|ing)? (of )?gas|fire|smoke|carbon monoxide|no water|sparking|no heat)\b/i;
const URGENT = /\b(urgent|asap|leak\w*|dripping|toilet|tap|faucet|no hot water|heat (isn'?t|is not|not) working|not heating)\b/i;

const words = (s) =>
  String(s || "")
    .toLowerCase()
    .match(/[a-z]{4,}/g)
    ?.filter((w) => !["with", "that", "this", "from", "have", "there", "they", "unit", "please", "thanks"].includes(w)) || [];
const similar = (a, b) => {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return false;
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / Math.min(A.size, B.size) >= 0.5;
};
const rank = { routine: 0, urgent: 1, emergency: 2 };
const maxUrgency = (a, b) => (rank[b] > rank[a] ? b : a);

// Who sent it: a current tenant (and their tenancy and unit), a landlord, or nobody we know.
async function whoSent(sb, email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return { kind: "unknown" };
  const { data: people } = await sb
    .from("tenancy_tenants")
    .select("full_name, tenancy:tenancies!inner(id, status, collects_rent, unit:units(id, label, management_type, property:properties(id, address)))")
    .ilike("email", e)
    .in("tenancy.status", ["active", "notice", "upcoming"]);
  if (people?.length) {
    const tenancies = [...new Map(people.map((p) => [p.tenancy.id, { ...p.tenancy, name: p.full_name }])).values()];
    return { kind: "tenant", tenancies };
  }
  const { data: owners } = await sb.from("owners").select("id, name").ilike("email", e).limit(1);
  if (owners?.length) return { kind: "landlord", owner: owners[0] };
  return { kind: "unknown" };
}

// IRep handles maintenance on managed units, and on maintenance-only tenancies (e.g. 1525 Hallmark Upper).
const weMaintain = (t) => t.unit?.management_type === "managed" || t.collects_rent === false;

// Creates one request per issue on the unit, or links to an open request for the same thing
// (same unit, similar title, opened in the last 30 days). Returns the request ids.
export async function createRequests(sb, email, tenancy, issues) {
  const unitId = tenancy.unit?.id || tenancy.unit_id;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: open } = await sb
    .from("maintenance_requests")
    .select("id, title, description, staff_notes, photos")
    .eq("unit_id", unitId)
    .not("status", "in", "(completed,cancelled)")
    .gte("created_at", since);
  const photos = (email.attachments || []).filter((a) => a.path);
  const when = new Date(email.received_at).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "long", day: "numeric", year: "numeric" });
  const original = `Original email (${when}, “${email.subject || "no subject"}”):\n${String(email.body || email.snippet || "").slice(0, 5000)}`;
  const ids = [];
  for (const issue of issues) {
    const dupe = (open || []).find((r) => similar(r.title, issue.title) || similar(r.description, issue.summary));
    if (dupe) {
      await sb
        .from("maintenance_requests")
        .update({
          staff_notes: [dupe.staff_notes, `Also reported by email on ${when}: ${issue.summary || issue.title}`].filter(Boolean).join("\n"),
          photos: [...(dupe.photos || []), ...photos],
        })
        .eq("id", dupe.id);
      ids.push(dupe.id);
      continue;
    }
    const { data, error } = await sb
      .from("maintenance_requests")
      .insert({
        unit_id: unitId,
        tenancy_id: tenancy.id,
        source: "email",
        category: issue.category || "other",
        title: issue.title,
        description: [issue.summary, original].filter(Boolean).join("\n\n"),
        urgency: issue.urgency || "routine",
        reporter_name: email.from_name || null,
        reporter_email: email.from_email || null,
        photos,
        status: "new",
        inbound_email_id: email.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    ids.push(data.id);
  }
  return ids;
}

// Decides what to do with an email once its files are in: a tenant's maintenance email is logged
// automatically; landlords, unknown senders, units IRep doesn't maintain and unclear emails go to review.
export async function processInbound(sb, id) {
  const { data: email } = await sb.from("inbound_emails").select("*").eq("id", id).maybeSingle();
  if (!email || !["none", "waiting_files"].includes(email.intake_status)) return { skipped: true };
  if (/payments\.interac\.ca|@ireppm\.ca$/i.test(email.from_email || "")) {
    await sb.from("inbound_emails").update({ intake_status: "none" }).eq("id", id);
    return { skipped: "not for intake" };
  }
  const text = `${email.subject || ""}\n${email.body || email.snippet || ""}`;
  const looksMaint = MAINT_WORDS.test(text);
  const sender = await whoSent(sb, email.from_email);
  if (!looksMaint && sender.kind !== "tenant") {
    await sb.from("inbound_emails").update({ intake_status: "none" }).eq("id", id);
    return { skipped: "not maintenance" };
  }

  let read = null;
  if (aiConfigured()) read = await splitMaintenanceEmail(sb, { subject: email.subject, body: email.body || email.snippet }).catch(() => null);
  if (!read) {
    read = {
      is_maintenance: looksMaint,
      about_rent: RENT_WORDS.test(email.subject || ""),
      confidence: looksMaint ? 0.6 : 0.2,
      issues: looksMaint ? [{ title: String(email.subject || "Maintenance request").slice(0, 80), summary: "", category: "other", urgency: "routine" }] : [],
    };
  }
  // Keywords can raise the urgency the model suggested, never lower it.
  const floor = EMERGENCY.test(text) ? "emergency" : URGENT.test(text) ? "urgent" : "routine";
  read.issues = read.issues.map((i) => ({ ...i, urgency: maxUrgency(i.urgency, floor) }));

  if (!read.is_maintenance || (read.about_rent && !looksMaint)) {
    await sb.from("inbound_emails").update({ intake_status: "none", intake: read }).eq("id", id);
    return { skipped: "not maintenance" };
  }

  const review = async (reason, extra = {}) => {
    await sb.from("inbound_emails").update({ intake_status: "review", intake: { ...read, reason }, ...extra }).eq("id", id);
    return { review: reason };
  };
  if (sender.kind === "landlord") return review(`From the landlord ${sender.owner.name}`);
  if (sender.kind === "unknown") return review("The sender isn't a current tenant");
  const ours = sender.tenancies.filter(weMaintain);
  if (!ours.length) return review("IRep doesn't handle maintenance for this tenant's unit (leasing only)", { tenancy_id: sender.tenancies[0].id, unit_id: sender.tenancies[0].unit?.id });
  if (ours.length > 1) return review("The sender is on more than one tenancy: choose the unit");
  if (read.confidence < 0.7 || !read.issues.length) return review("Not sure this is a maintenance request", { tenancy_id: ours[0].id, unit_id: ours[0].unit?.id });

  const ids = await createRequests(sb, email, ours[0], read.issues);
  await sb
    .from("inbound_emails")
    .update({ intake_status: "auto", intake: read, tenancy_id: ours[0].id, unit_id: ours[0].unit?.id, maintenance_request_ids: ids, category: "maintenance" })
    .eq("id", id);
  return { created: ids };
}

export const cleanBody = (s) => redact(String(s || "")).slice(0, 8000);
