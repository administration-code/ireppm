import "server-only";
import { sendMail, SITE_URL } from "@/lib/application-review";
import { PAYMENT_INFO } from "@/lib/payment-info";
import { SITE } from "@/lib/site";

// Invitations to the website for owners and tenants who are already with IRep but have no account yet.
// Accounts link to the owner / tenant record by email automatically when they first sign in,
// so the invitation only has to get them to sign in with the same address.

const first = (name) => String(name || "").trim().split(/\s+/)[0] || "there";
const inviteLink = (path, email) => `${SITE_URL}${path}?invite=${encodeURIComponent(email)}`;
const placeOf = (unit) => [unit?.property?.address, unit?.label].filter(Boolean).join(", ");

const SIGN_IN =
  'Click the button below. Your email (EMAIL) is filled in for you. Choose "Continue with Google" if it\'s a Gmail address, or add your mobile number and we\'ll email you a one-time sign-in link. There\'s no password to remember.';
const APP_LINE = "Tip: add IRep to your phone's home screen from Get the App at the bottom of any page on our website, so it opens like an app.";

export function ownerInviteEmail(owner, addresses = []) {
  const homes = addresses.length ? addresses.join(", ") : "your property";
  return {
    to: owner.email,
    subject: "Your IRep owner portal is ready",
    lines: [
      `Hi ${first(owner.name)},`,
      `Thanks for trusting IRep Property Management with ${homes}. Your owner portal is now set up, so everything about your property is in one place, any time.`,
      "In your portal you can:\n• See rent collected and what's been paid out to you each month\n• Read your monthly summary and landlord letters\n• Approve repairs and see maintenance as it happens\n• Review applicants and tenant insurance\n• Download your year-end statement for your T776 rental income",
      "Payouts: Each month we pay out the rent received by the 7th, less fees and any repairs. Tenants pay manually by PayProp or Interac e-Transfer, so we can't control exactly when rent arrives; rent that comes in after the 7th is paid out to you as soon as we receive it.",
      "Repairs: Emergencies are handled right away. Other repairs over $250 wait for your OK in the portal.",
      "Late rent: If rent is still unpaid after the 7th, we email you an N4 to sign around the 8th, then deliver it to the tenant, usually within about 3 days of your signature.",
      "Refer a landlord: When a landlord you refer signs with us, you get a month's management fee free.",
      SIGN_IN.replace("EMAIL", owner.email),
      APP_LINE,
      `Questions? Reply to this email or call ${SITE.phone}.`,
    ],
    link: inviteLink("/owner", owner.email),
    linkLabel: "Open your owner portal",
    marketing: true,
  };
}

// New tenants (moved in within the last two weeks, or moving in soon) are told insurance is due within
// a week of moving in; existing tenants get a gentle reminder instead.
function isNewTenancy(tenancy) {
  if (tenancy?.status === "upcoming") return true;
  const start = tenancy?.start_date ? new Date(`${tenancy.start_date}T12:00:00`) : null;
  return Boolean(start) && Date.now() - start.getTime() < 14 * 864e5;
}

export function tenantInviteEmail(person, tenancy) {
  const place = placeOf(tenancy?.unit) || "your home";
  return {
    to: person.email,
    subject: `Your IRep tenant account for ${place}`,
    lines: [
      `Hi ${first(person.full_name)},`,
      `IRep Property Management looks after ${place} for your landlord. We've opened a tenant account for you on our website to make things easier.`,
      "In your account you can:\n• Report repairs with photos and follow them until they're fixed\n• See your lease, rent and payment details, including your PayProp welcome letter\n• Upload proof of tenant insurance\n• Tell us your plans when your lease is coming up for its end date",
      `Rent: Rent is due on the 1st of each month. ${PAYMENT_INFO.preferred} is our preferred way to pay; your PayProp welcome letter, with your reference number, is in your account. You can also pay by Interac e-Transfer to ${PAYMENT_INFO.etransferEmail}: put your unit address in the message so we can record it to the right tenant.`,
      `Monthly draw: ${PAYMENT_INFO.draw}`,
      isNewTenancy(tenancy)
        ? "Tenant insurance: Please upload proof of your tenant insurance in your account within a week of moving in."
        : "Tenant insurance: If we don't have your current tenant insurance on file yet, you can upload it in your account in a minute. It protects your belongings and covers you if something goes wrong.",
      SIGN_IN.replace("EMAIL", person.email),
      APP_LINE,
      `Questions? Reply to this email or call ${SITE.phone}. For emergencies (flooding, no heat in winter, no power, a sewer backup), call ${SITE.emergency.name} right away at ${SITE.emergency.phone}. If you smell gas, there's a fire or anyone is in danger, call 911 first.`,
    ],
    link: inviteLink("/account", person.email),
    linkLabel: "Open your tenant account",
    marketing: true,
  };
}

// Owners and tenants (current leases) with an email and no account yet.
export async function inviteCandidates(admin) {
  const [owners, people] = await Promise.all([
    admin
      .from("owners")
      .select("id, name, email, profile_id, portal_invited_at, properties(address, archived)")
      .order("name"),
    admin
      .from("tenancy_tenants")
      .select("id, full_name, email, profile_id, portal_invited_at, tenancy:tenancies(id, status, start_date, unit:units(label, property:properties(address)))")
      .order("full_name"),
  ]);
  if (owners.error) throw new Error(owners.error.message);
  if (people.error) throw new Error(people.error.message);
  return {
    owners: (owners.data || [])
      .filter((o) => (o.properties || []).some((p) => !p.archived))
      .map((o) => ({
        id: o.id,
        name: o.name,
        email: o.email,
        linked: Boolean(o.profile_id),
        invited_at: o.portal_invited_at,
        detail: (o.properties || []).filter((p) => !p.archived).map((p) => p.address).join(", "),
      })),
    tenants: (people.data || [])
      .filter((p) => ["upcoming", "active", "notice"].includes(p.tenancy?.status))
      .map((p) => ({
        id: p.id,
        name: p.full_name,
        email: p.email,
        linked: Boolean(p.profile_id),
        invited_at: p.portal_invited_at,
        detail: placeOf(p.tenancy?.unit),
      })),
  };
}

export async function sendInvites(admin, { owners = [], tenants = [] }) {
  let sent = 0;
  const skipped = [];
  if (owners.length) {
    const { data } = await admin.from("owners").select("id, name, email, profile_id, properties(address, archived)").in("id", owners);
    for (const o of data || []) {
      if (!o.email || o.profile_id) { skipped.push(o.name); continue; }
      const r = await sendMail(ownerInviteEmail(o, (o.properties || []).filter((p) => !p.archived).map((p) => p.address)));
      if (r.sent) {
        sent += 1;
        await admin.from("owners").update({ portal_invited_at: new Date().toISOString() }).eq("id", o.id);
      } else skipped.push(o.name);
    }
  }
  if (tenants.length) {
    const { data } = await admin
      .from("tenancy_tenants")
      .select("id, full_name, email, profile_id, tenancy:tenancies(status, start_date, unit:units(label, property:properties(address)))")
      .in("id", tenants);
    for (const p of data || []) {
      if (!p.email || p.profile_id || !p.tenancy) { skipped.push(p.full_name); continue; }
      const r = await sendMail(tenantInviteEmail(p, p.tenancy));
      if (r.sent) {
        sent += 1;
        await admin.from("tenancy_tenants").update({ portal_invited_at: new Date().toISOString() }).eq("id", p.id);
      } else skipped.push(p.full_name);
    }
  }
  return { sent, skipped };
}
