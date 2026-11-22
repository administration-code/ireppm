import "server-only";
import { aiConfigured, classifyEmail } from "@/lib/ai";

export const LABELS = { maintenance: "Maintenance", rent: "Rent", lease: "Lease & Signatures", notices: "Notices", landlord: "Landlord", general: "General" };
const OURS = /@ireppm\.ca$|@ireprealty\.com$/i;
const CURRENT = ["active", "notice", "upcoming"];

// Attachments that look like ID, licences or rental applications with ID are never stored or shown.
const ID_LIKE =
  /(licen[cs]e|driver|passport|\bid\b|[_\- ]id[_\-. ]|photo.?id|health.?card|ohip|\bsin\b|social.?insurance|pr.?card|permanent.?resident|citizenship|birth.?cert|government|gov.?id|application|rental.?app|credit.?report|void.?cheque|bank.?statement)/i;
export const idLikeAttachment = (a) => ID_LIKE.test(` ${String(a?.name || "")} `);

// Which address is the other party: the sender for mail we received, the first outside recipient for mail we sent.
export function otherParty(email) {
  if (email.direction === "out") return (email.to_emails || []).map((e) => String(e).toLowerCase()).find((e) => !OURS.test(e)) || null;
  const f = String(email.from_email || "").toLowerCase();
  return f && !OURS.test(f) ? f : null;
}

// System senders (DocuSign, Vercel, no-reply and bounce addresses) are filed as "not a contact".
const AUTOMATED =
  /(^|[._+-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?|alerts?)([._+-]|@)|@([\w-]+\.)*(docusign\.(net|com)|vercel\.com|amazonses\.com|mail\.anthropic\.com)$/i;
export const isAutomatedAddress = (e) => AUTOMATED.test(String(e || ""));
// IRep's own auto-acknowledgement ("We've received your message") is not a real reply.
// Emails that aren't kept at all: DocuSign's own status mail (the Signatures page records sent, viewed and signed
// from DocuSign directly), and receipts or security codes from automated senders. A person replying to a DocuSign
// email comes from their own address, so it's still logged.
export const isDocuSignSystem = (e) => /@([\w-]+\.)*docusign\.(net|com)$/i.test(String(e || ""));
const CODE_SUBJECT = /\b(security|verification|confirmation|login|log-?in|sign-?in|one-?time|access|authentication)\s+(code|pin|link)\b|\bverify your\b|\b2fa\b|\bsecurity alert\b|\bnew sign-?in\b/i;
const RECEIPT_SUBJECT = /\b(receipt|invoice|payment (received|confirmation|successful)|your payment|subscription|order confirmation|billing)\b/i;
export function skipLogging({ from_email, subject, automated }) {
  if (isDocuSignSystem(from_email)) return "DocuSign status email";
  const auto = automated || isAutomatedAddress(from_email);
  if (auto && CODE_SUBJECT.test(subject || "")) return "Security or verification code";
  if (auto && RECEIPT_SUBJECT.test(subject || "")) return "Receipt or billing email";
  return null;
}
export const isAutoReply = (subject) => /^\s*we[’']ve received your message/i.test(String(subject || ""));

// Tenant, landlord, applicant or partner for an address, with their unit and property.
export async function matchParty(sb, address) {
  const e = String(address || "").trim().toLowerCase();
  const none = { party_kind: "unmatched", party_email: e || null };
  // Only IRep addresses on it (sent to ourselves, or between staff): nobody to match.
  if (!e) return { party_kind: "ignored", party_email: null, party_name: "IRep (internal)" };
  const unitOf = async (tenancyId) => {
    const { data } = await sb.from("tenancies").select("id, unit_id, unit:units(property_id, property:properties(owner_id))").eq("id", tenancyId).maybeSingle();
    return data ? { tenancy_id: data.id, unit_id: data.unit_id, property_id: data.unit?.property_id || null } : {};
  };

  const { data: rule } = await sb.from("email_address_rules").select("*").eq("email", e).maybeSingle();
  if (!rule && isAutomatedAddress(e)) return { party_kind: "ignored", party_email: e, party_name: "Automated sender" };
  if (rule) {
    if (rule.party_kind === "ignored") return { party_kind: "ignored", party_email: e, party_name: rule.name };
    if (rule.party_kind === "tenant") return { party_kind: "tenant", party_email: e, party_name: rule.name, ...(await unitOf(rule.tenancy_id)) };
    if (rule.party_kind === "landlord") return { party_kind: "landlord", party_email: e, party_name: rule.name, owner_id: rule.owner_id };
    if (rule.party_kind === "applicant") return { party_kind: "applicant", party_email: e, party_name: rule.name, application_id: rule.application_id };
    if (rule.party_kind === "partner") return { party_kind: "partner", party_email: e, party_name: rule.name, partner_id: rule.partner_id };
  }

  const { data: people } = await sb
    .from("tenancy_tenants")
    .select("full_name, tenancy:tenancies!inner(id, status, start_date, unit_id, unit:units(property_id))")
    .ilike("email", e);
  if (people?.length) {
    const best = [...people].sort(
      (a, b) => Number(CURRENT.includes(b.tenancy.status)) - Number(CURRENT.includes(a.tenancy.status)) || String(b.tenancy.start_date).localeCompare(String(a.tenancy.start_date))
    )[0];
    return {
      party_kind: "tenant",
      party_email: e,
      party_name: best.full_name,
      tenancy_id: best.tenancy.id,
      unit_id: best.tenancy.unit_id,
      property_id: best.tenancy.unit?.property_id || null,
    };
  }
  const { data: owners } = await sb.from("owners").select("id, name").ilike("email", e).limit(1);
  if (owners?.length) return { party_kind: "landlord", party_email: e, party_name: owners[0].name, owner_id: owners[0].id };
  const { data: partners } = await sb.from("partners").select("id, name, company").ilike("email", e).limit(1);
  if (partners?.length) return { party_kind: "partner", party_email: e, party_name: partners[0].company || partners[0].name, partner_id: partners[0].id };
  const { data: apps } = await sb.from("applications").select("id, applicant_name").ilike("applicant_email", e).order("created_at", { ascending: false }).limit(1);
  if (apps?.length) return { party_kind: "applicant", party_email: e, party_name: apps[0].applicant_name, application_id: apps[0].id };
  return none;
}

const RULES = [
  ["notices", /\b(N4|N5|N8|N11|N12|N13|N1)\b|notice (of|to) (termination|end|terminate)|\bLTB\b|landlord and tenant board|evict|certificate of service|rent increase notice/i],
  ["lease", /\blease\b|docusign|signature|sign (the|your)|renewal|renew|amendment|move[- ]in date|onboarding/i],
  ["rent", /\brent\b|payment|e-?transfer|payprop|arrears|receipt|owing|balance|late fee|NSF|statement|payout/i],
  [
    "maintenance",
    /\b(leak\w*|flood\w*|broken|not working|repair|fix|furnace|heat(er|ing)?|hot water|toilet|tap|faucet|drain|clog\w*|mou?ld|pests?|mice|mouse|cockroach\w*|bed ?bugs?|appliance|fridge|stove|washer|dryer|smoke detector|maintenance|contractor|plumb\w*|electric\w*)\b/i,
  ],
];

// Rules first; Claude Haiku only when the rules find no label or more than one.
export async function labelEmail(sb, email, party, { ai = true } = {}) {
  const text = `${email.subject || ""}\n${String(email.body || email.snippet || "").slice(0, 3000)}`;
  const hits = RULES.filter(([, re]) => re.test(text)).map(([k]) => k);
  const subjectHits = RULES.filter(([, re]) => re.test(email.subject || "")).map(([k]) => k);
  if (hits.length === 1) return { category: hits[0], label_source: "rule" };
  if (subjectHits.length === 1) return { category: subjectHits[0], label_source: "rule" };
  if (!hits.length && party?.party_kind === "landlord") return { category: "landlord", label_source: "rule" };
  if (ai && aiConfigured()) {
    try {
      const c = await classifyEmail(sb, { from: email.from_email || "", subject: email.subject, snippet: email.body || email.snippet });
      return { ...c, label_source: "ai", classified_at: new Date().toISOString() };
    } catch (err) {
      console.error("[comms] label failed:", err?.message || err);
    }
  }
  return { category: hits[0] || (party?.party_kind === "landlord" ? "landlord" : "general"), label_source: "rule" };
}

// Re-match every stored email from an address (after staff assign it).
export async function rematchAddress(sb, address) {
  const party = await matchParty(sb, address);
  const clear = { tenancy_id: null, unit_id: null, property_id: null, owner_id: null, application_id: null, partner_id: null, party_name: null };
  const { error } = await sb.from("inbound_emails").update({ ...clear, ...party }).eq("party_email", String(address).toLowerCase());
  if (error) throw new Error(error.message);
  return party;
}

// Business days between a time and now (Mon–Fri, Toronto).
export function olderThanBusinessDays(iso, days = 1, now = new Date()) {
  const d = new Date(iso);
  let count = 0;
  const cur = new Date(d);
  while (cur < now) {
    cur.setDate(cur.getDate() + 1);
    if (cur > now) break;
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) count += 1;
  }
  return count >= days;
}
