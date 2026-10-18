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

export function ownerInviteEmail(owner, addresses = []) {
  const homes = addresses.length ? addresses.join(", ") : "your property";
  return {
    to: owner.email,
    subject: "Your IRep owner portal is ready",
    lines: [
      `Hi ${first(owner.name)},`,
      `Thanks for trusting IRep Property Management with ${homes}. Your owner portal is now set up, so everything about your property is in one place, any time.`,
      "In your portal you can:\n• See rent collected and what's been paid out to you each month\n• Read your monthly summary and landlord letters\n• Approve repairs and see maintenance as it happens\n• Review applicants and tenant insurance\n• Download your year-end statement for your T776 rental income",
      `To get in, click "Open your owner portal" below. Your email (${owner.email}) is filled in for you: add your mobile number and we'll email you a one-time sign-in link. There's no password to remember.`,
      `Questions? Reply to this email or call ${SITE.phone}.`,
    ],
    link: inviteLink("/owner", owner.email),
    linkLabel: "Open your owner portal",
    marketing: true,
  };
}

export function tenantInviteEmail(person, tenancy) {
  const place = placeOf(tenancy?.unit) || "your home";
  return {
    to: person.email,
    subject: `Your IRep tenant account for ${place}`,
    lines: [
      `Hi ${first(person.full_name)},`,
      `IRep Property Management looks after ${place} for your landlord. We've opened a tenant account for you on our website to make things easier.`,
      "In your account you can:\n• Report repairs with photos and follow them until they're fixed\n• See your lease, rent and payment details\n• Upload proof of tenant insurance\n• Tell us your plans when your lease is coming up for its end date",
      `Rent: ${PAYMENT_INFO.preferred} is our preferred way to pay. If you haven't set it up yet, watch for PayProp's welcome letter. Can't use PayProp? Ask us about Interac e-Transfer to ${PAYMENT_INFO.etransferEmail}.`,
      `Monthly draw: ${PAYMENT_INFO.draw}`,
      `To get in, click "Open your tenant account" below. Your email (${person.email}) is filled in for you: add your mobile number and we'll email you a one-time sign-in link. There's no password to remember.`,
      `Questions? Reply to this email or call ${SITE.phone}. For emergencies (flooding, no heat in winter, gas smell, fire), call us right away, and call 911 first if anyone is in danger.`,
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
      .select("id, full_name, email, profile_id, portal_invited_at, tenancy:tenancies(id, status, unit:units(label, property:properties(address)))")
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
      .select("id, full_name, email, profile_id, tenancy:tenancies(unit:units(label, property:properties(address)))")
      .in("id", tenants);
    for (const p of data || []) {
      if (!p.email || p.profile_id) { skipped.push(p.full_name); continue; }
      const r = await sendMail(tenantInviteEmail(p, p.tenancy));
      if (r.sent) {
        sent += 1;
        await admin.from("tenancy_tenants").update({ portal_invited_at: new Date().toISOString() }).eq("id", p.id);
      } else skipped.push(p.full_name);
    }
  }
  return { sent, skipped };
}
