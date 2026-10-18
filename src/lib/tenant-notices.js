import "server-only";
import { sendMail, staffEmails, SITE_URL } from "@/lib/application-review";
import { PAYMENT_INFO } from "@/lib/payment-info";
import { SITE } from "@/lib/site";

// Automatic emails: welcome letters, tenant insurance reminders and lease-end choices
// (migration 0033). Each job marks what it sent so it never repeats.

const PORTAL = `${SITE_URL}/account`;
const RESOURCES = `${SITE_URL}/resources`;
const DAY = 86400000;

const longDay = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "";
const addDays = (iso, n) => new Date(new Date(`${iso}T12:00:00`).getTime() + n * DAY).toISOString().slice(0, 10);
const money = (n) => `$${Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

const TENANCY_SELECT =
  "id, status, start_date, end_date, rent, rent_due_day, insurance_due, insurance_reminded_at, insurance_overdue_alerted_at, renewal_choice, renewal_prompted_at, renewal_reminded_at, unit:units(label, property:properties(address, city, owner:owners(name, email))), tenancy_tenants(full_name, email)";

const placeOf = (t) => [t.unit?.property?.address, t.unit?.label].filter(Boolean).join(", ");
const tenantEmails = (t) => (t.tenancy_tenants || []).map((p) => p.email).filter(Boolean);
const firstNames = (t) =>
  (t.tenancy_tenants || []).map((p) => String(p.full_name || "").split(" ")[0]).filter(Boolean).join(" and ") || "there";

// ---------------------------------------------------------------------------
// Welcome letter, sent when the lease is fully signed.
// ---------------------------------------------------------------------------
export async function sendWelcome(sb, tenancyId) {
  if (!tenancyId) return { sent: false };
  const { data: t } = await sb
    .from("tenancies")
    .select(`${TENANCY_SELECT}, payprop_letter_path, payprop_letter_name`)
    .eq("id", tenancyId)
    .maybeSingle();
  if (!t || !tenantEmails(t).length) return { sent: false };
  const due = t.insurance_due || addDays(t.start_date, 7);
  // If staff already uploaded the PayProp welcome letter, attach it.
  let attachments;
  if (t.payprop_letter_path) {
    const { data: file } = await sb.storage.from("tenancy-documents").download(t.payprop_letter_path);
    if (file) attachments = [{ filename: t.payprop_letter_name || "PayProp welcome letter.pdf", content: Buffer.from(await file.arrayBuffer()).toString("base64") }];
  }
  const r = await sendMail({
    attachments,
    to: tenantEmails(t),
    subject: `Welcome to ${placeOf(t)}`,
    lines: [
      `Hi ${firstNames(t)},`,
      `Welcome home! Your lease for ${placeOf(t)} is signed. We're IRep Property Management, and we look after the property for your landlord. Here's what to know before you move in on ${longDay(t.start_date)}.`,
      `Rent: ${money(t.rent)} a month, due on day ${t.rent_due_day || 1} of each month.`,
      attachments ? "Your PayProp welcome letter is attached: follow it to set up your rent payments. It's also saved in your account." : "",
      `How to pay: ${PAYMENT_INFO.preferred} is our preferred way.\n• ${PAYMENT_INFO.preferredSteps.join("\n• ")}\nIf you can't use PayProp, ask us and we'll set you up for ${PAYMENT_INFO.fallback.replace(", on request", "")}.`,
      `Monthly draw: ${PAYMENT_INFO.draw}`,
      `Tenant insurance: please upload proof of your tenant insurance by ${longDay(due)} (within a week of moving in). You can upload it in your account.`,
      `Repairs: report anything that needs fixing from your account, with photos. For emergencies (flooding, no heat in winter, no power, a sewer backup), call ${SITE.emergency.name} right away at ${SITE.emergency.phone}. If you smell gas, there's a fire or anyone is in danger, call 911 first.`,
      `Your account: sign in with this email address to see your home, report problems and keep your documents in one place.`,
      `Questions? Reply to this email or call ${SITE.phone}. Useful information for tenants, including your rights under Ontario law, is on our resources page: ${RESOURCES}`,
    ],
    link: PORTAL,
    linkLabel: "Open your account",
  });
  if (attachments && r.sent) await sb.from("tenancies").update({ payprop_letter_sent_at: new Date().toISOString() }).eq("id", t.id);
  // PayProp's welcome letter needs the tenant set up there first: remind staff (unless it's already attached).
  if (!attachments) await sendMail({
    to: staffEmails(),
    subject: `Set up in PayProp: ${placeOf(t)}`,
    lines: [
      `The lease for ${placeOf(t)} is signed and the tenant welcome email has gone out.`,
      `Next, in PayProp: add the tenant(s) (${(t.tenancy_tenants || []).map((p) => [p.full_name, p.email].filter(Boolean).join(", ")).join("; ")}), rent ${money(t.rent)} due on day ${t.rent_due_day || 1}, starting ${longDay(t.start_date)}, then upload the PayProp welcome letter on the tenancy (unit page) and click "Email to tenants". It's also saved in their account.`,
    ],
  }).catch(() => {});
  return r;
}

// PayProp welcome letter (uploaded by staff on the tenancy): email it to the tenants as an
// attachment, and point them to their account where it stays available.
export async function emailPaypropLetter(sb, tenancyId) {
  const { data: t } = await sb
    .from("tenancies")
    .select(`${TENANCY_SELECT}, payprop_letter_path, payprop_letter_name`)
    .eq("id", tenancyId)
    .maybeSingle();
  if (!t) throw new Error("Tenancy not found.");
  if (!t.payprop_letter_path) throw new Error("Upload the PayProp welcome letter first.");
  if (!tenantEmails(t).length) throw new Error("No tenant email on file.");
  const { data: file, error } = await sb.storage.from("tenancy-documents").download(t.payprop_letter_path);
  if (error || !file) throw new Error("We couldn't read the uploaded letter.");
  const content = Buffer.from(await file.arrayBuffer()).toString("base64");
  const r = await sendMail({
    to: tenantEmails(t),
    subject: `Your PayProp welcome letter: ${placeOf(t)}`,
    lines: [
      `Hi ${firstNames(t)},`,
      `Attached is your PayProp welcome letter for ${placeOf(t)}. PayProp is how we collect rent: it has your sign-up details and the payment reference for your home.`,
      "What to do:\n• Find your Bill Payment Reference ID in the attached letter\n• In your online or mobile banking, set up a bill payment to the payee shown in the letter, using that reference ID as the account number (or pay at your branch, or sign up for pre-authorized debit)\n• Keep the letter: it's also saved in your IRep account any time you need it",
      `Rent: ${money(t.rent)} a month, due on day ${t.rent_due_day || 1}.`,
      `Monthly draw: ${PAYMENT_INFO.draw}`,
      `Questions? Reply to this email or call ${SITE.phone}.`,
    ],
    link: PORTAL,
    linkLabel: "Open your account",
    attachments: [{ filename: t.payprop_letter_name || "PayProp welcome letter.pdf", content }],
  });
  if (!r.sent) throw new Error("The email didn't send. Try again in a minute.");
  await sb.from("tenancies").update({ payprop_letter_sent_at: new Date().toISOString() }).eq("id", t.id);
  return { sent: true, to: tenantEmails(t) };
}

// ---------------------------------------------------------------------------
// Tenant insurance: reminder 3 days after the start if nothing is uploaded; once overdue,
// another reminder to the tenant and an alert to staff and the landlord.
// ---------------------------------------------------------------------------
export async function insuranceReminders(sb) {
  const now = today();
  const { data: list } = await sb
    .from("tenancies")
    .select(`${TENANCY_SELECT}, tenant_insurance(status)`)
    .in("status", ["upcoming", "active"])
    .lte("start_date", addDays(now, 0));
  let reminded = 0, overdue = 0;
  for (const t of list || []) {
    const proofs = t.tenant_insurance || [];
    if (proofs.some((p) => ["submitted", "approved"].includes(p.status))) continue;
    const due = t.insurance_due || addDays(t.start_date, 7);
    if (now >= addDays(t.start_date, 3) && now < due && !t.insurance_reminded_at && tenantEmails(t).length) {
      await sendMail({
        to: tenantEmails(t),
        subject: `Reminder: proof of tenant insurance due ${longDay(due)}`,
        lines: [
          `Hi ${firstNames(t)},`,
          `Your lease for ${placeOf(t)} requires tenant insurance. Please upload proof (the policy page showing your name, address and dates) by ${longDay(due)}.`,
          "Most insurers can email you this page the same day.",
        ],
        link: PORTAL,
        linkLabel: "Upload proof of insurance",
      });
      await sb.from("tenancies").update({ insurance_reminded_at: new Date().toISOString() }).eq("id", t.id);
      reminded += 1;
    }
    if (now > due && !t.insurance_overdue_alerted_at) {
      if (tenantEmails(t).length)
        await sendMail({
          to: tenantEmails(t),
          subject: "Proof of tenant insurance is overdue",
          lines: [
            `Hi ${firstNames(t)},`,
            `We haven't received proof of tenant insurance for ${placeOf(t)}. It was due ${longDay(due)} and is required by your lease. Please upload it as soon as possible.`,
          ],
          link: PORTAL,
          linkLabel: "Upload proof of insurance",
        });
      const owner = t.unit?.property?.owner;
      await sendMail({
        to: [...staffEmails(), ...(owner?.email ? [owner.email] : [])],
        subject: `Tenant insurance overdue: ${placeOf(t)}`,
        lines: [
          `The tenants at ${placeOf(t)} haven't uploaded proof of tenant insurance. It was due ${longDay(due)}.`,
          "They've been reminded. IRep will follow up.",
        ],
      });
      await sb.from("tenancies").update({ insurance_overdue_alerted_at: new Date().toISOString() }).eq("id", t.id);
      overdue += 1;
    }
  }
  return { reminded, overdue };
}

// ---------------------------------------------------------------------------
// Lease end: 90 days before a fixed term ends, ask the tenants what they'd like to do; remind
// them a week before the 60-day notice deadline if they haven't answered.
// ---------------------------------------------------------------------------
export async function leaseEndPrompts(sb) {
  const now = today();
  const { data: list } = await sb
    .from("tenancies")
    .select(TENANCY_SELECT)
    .eq("status", "active")
    .not("end_date", "is", null)
    .gte("end_date", now)
    .lte("end_date", addDays(now, 90))
    .is("renewal_choice", null);
  let prompted = 0, reminded = 0;
  for (const t of list || []) {
    if (!tenantEmails(t).length) continue;
    const deadline = addDays(t.end_date, -60);
    if (deadline < now) continue; // too late for an N9; the tenancy simply goes month to month
    const options = [
      "• Stay on month to month: nothing changes except the end date. Your lease terms carry on.",
      "• Ask for a new lease: we'll talk to the landlord and send you a new one to sign.",
      `• Move out: give your 60-day notice (form N9) in your account by ${longDay(deadline)}.`,
    ].join("\n");
    if (!t.renewal_prompted_at) {
      await sendMail({
        to: tenantEmails(t),
        subject: `Your lease ends ${longDay(t.end_date)}: what would you like to do?`,
        lines: [
          `Hi ${firstNames(t)},`,
          `Your lease for ${placeOf(t)} ends on ${longDay(t.end_date)}. Please let us know your plans:`,
          options,
          "Choose in your account. If you do nothing, Ontario law keeps your tenancy going month to month on the same terms.",
        ],
        link: `${PORTAL}#lease-end`,
        linkLabel: "Choose in your account",
      });
      await sb.from("tenancies").update({ renewal_prompted_at: new Date().toISOString() }).eq("id", t.id);
      prompted += 1;
    } else if (!t.renewal_reminded_at && now >= addDays(deadline, -7) && now <= deadline) {
      await sendMail({
        to: tenantEmails(t),
        subject: `Reminder: if you're moving out, give notice by ${longDay(deadline)}`,
        lines: [
          `Hi ${firstNames(t)},`,
          `Your lease for ${placeOf(t)} ends on ${longDay(t.end_date)}. If you plan to move out then, your 60-day notice (N9) must be given by ${longDay(deadline)}.`,
          options,
        ],
        link: `${PORTAL}#lease-end`,
        linkLabel: "Choose in your account",
      });
      await sb.from("tenancies").update({ renewal_reminded_at: new Date().toISOString() }).eq("id", t.id);
      reminded += 1;
    }
  }
  return { prompted, reminded };
}
