import "server-only";
import { sendMail, staffEmails, SITE_URL } from "@/lib/application-review";

// Showing requests (see migration 0032): Chuck answers from a private link; renters answer a
// suggested time; current tenants get written notice once a showing is confirmed.

export const WINDOWS = ["Morning (9 am – 12 pm)", "Afternoon (12 – 5 pm)", "Evening (5 – 8 pm)"];

export function showingsInbox() {
  const list = (process.env.SHOWINGS_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : staffEmails();
}

export const respondLink = (token) => `${SITE_URL}/showings/respond?t=${token}`;

export function prettyDay(iso) {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export const placeOf = (l) => [l?.address, l?.unit].filter(Boolean).join(", ") || "the rental";

// Start of a time window, as a Date (Windsor time).
export function windowStart(dateIso, window) {
  const hour = /^morning/i.test(window) ? 9 : /^evening/i.test(window) ? 17 : 12;
  // Find the UTC offset for Toronto on that day.
  const probe = new Date(`${dateIso}T12:00:00Z`);
  const tz = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", timeZoneName: "shortOffset" })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value || "GMT-5";
  const offset = Number((tz.match(/GMT([+-]\d+)/) || [0, -5])[1]);
  return new Date(Date.UTC(...dateIso.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))), hour - offset));
}

// Everything a decision needs, by showing id (service-role client).
export async function loadShowing(admin, id) {
  const { data: s } = await admin
    .from("showing_requests")
    .select("*, listing:listings(id, slug, address, unit, city), renter:profiles(full_name, email, phone)")
    .eq("id", id)
    .maybeSingle();
  if (!s) return null;
  const [{ data: vacant }, { data: units }] = await Promise.all([
    admin.rpc("listing_is_vacant", { p_listing_id: s.listing_id }),
    admin
      .from("units")
      .select("id, label, tenancies(id, status, tenancy_tenants(full_name, email))")
      .eq("listing_id", s.listing_id),
  ]);
  const tenants = [];
  for (const u of units || [])
    for (const t of u.tenancies || [])
      if (["active", "notice"].includes(t.status))
        for (const p of t.tenancy_tenants || []) if (p.email) tenants.push({ name: p.full_name, email: p.email });
  return { ...s, vacant: Boolean(vacant), tenants };
}

export async function loadShowingByToken(admin, token) {
  if (!/^[0-9a-f-]{36}$/i.test(String(token || ""))) return null;
  const { data } = await admin.from("showing_action_tokens").select("showing_id").eq("token", token).maybeSingle();
  return data ? loadShowing(admin, data.showing_id) : null;
}

// Written notice of entry for the current tenants (RTA s. 27: 24 hours, between 8 a.m. and 8 p.m.).
export async function sendTenantNotice(admin, s) {
  if (s.vacant || !s.tenants.length) return { sent: 0 };
  const place = placeOf(s.listing);
  let sent = 0;
  for (const t of s.tenants) {
    const r = await sendMail({
      to: t.email,
      subject: `Notice of entry: showing on ${prettyDay(s.preferred_date)} (${place})`,
      lines: [
        `Hi ${t.name || "there"},`,
        `This is your written notice that IRep Property Management will enter ${place} to show it to a prospective tenant.`,
        `Date: ${prettyDay(s.preferred_date)}\nTime: ${s.preferred_time}`,
        "We'll knock and keep it brief. You're welcome to be home, but you don't need to be.",
        "If something about this time is a problem, reply to this email or call us and we'll do our best to work around it.",
      ],
    });
    if (r.sent) sent += 1;
  }
  if (sent) await admin.from("showing_requests").update({ tenant_notice_sent_at: new Date().toISOString() }).eq("id", s.id);
  return { sent };
}

export async function emailRenter(s, kind) {
  const to = s.renter?.email;
  if (!to) return;
  const place = placeOf(s.listing);
  const when = (d, w) => `${prettyDay(d)}, ${String(w || "").toLowerCase()}`;
  const content = {
    confirmed: {
      subject: `Showing confirmed: ${place}`,
      lines: [`Your showing at ${place} is confirmed for ${when(s.preferred_date, s.preferred_time)}.`, s.staff_note ? `Note from IRep: ${s.staff_note}` : "", "We'll text you if anything changes."],
    },
    declined: {
      subject: `About your showing request: ${place}`,
      lines: [`We can't do a showing at ${place} at the time you asked.`, s.staff_note ? `Note from IRep: ${s.staff_note}` : "", "You're welcome to request another time on the listing."],
    },
    rescheduled: {
      subject: `New time suggested for your showing: ${place}`,
      lines: [`We can't make your requested time at ${place}. Could you do ${when(s.proposed_date, s.proposed_time)} instead?`, s.staff_note ? `Note from IRep: ${s.staff_note}` : "", "Accept or decline the new time in your account."],
      link: `${SITE_URL}/account?tab=showings`,
      linkLabel: "Answer in your account",
    },
  }[kind];
  if (content) await sendMail({ to, ...content, lines: content.lines.filter(Boolean) });
}
