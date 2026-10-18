import "server-only";
import { sendMail, staffEmails, SITE_URL } from "@/lib/application-review";

const PUBLIC_COLS = "id, created_at, reviewer_type, display_name, rating, title, body, verified, staff_reply, approved_at";
const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function approvedReviews(admin) {
  const { data, error } = await admin.from("reviews").select(PUBLIC_COLS).eq("status", "approved").order("approved_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}

export function reviewStats(rows) {
  const avg = (list) => (list.length ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10 : null);
  const t = rows.filter((r) => r.reviewer_type === "tenant");
  const l = rows.filter((r) => r.reviewer_type === "landlord");
  return { all: { count: rows.length, avg: avg(rows) }, tenant: { count: t.length, avg: avg(t) }, landlord: { count: l.length, avg: avg(l) } };
}

// Public submission. Signed-in reviewers who are a current or past tenant or landlord with us get "verified".
export async function submitReview(admin, input, user) {
  if (clean(input.website, 50)) return { ok: true }; // honeypot: pretend it worked
  const reviewer_type = input.reviewer_type === "landlord" ? "landlord" : input.reviewer_type === "tenant" ? "tenant" : null;
  const rating = Math.round(Number(input.rating));
  const display_name = clean(input.display_name, 60);
  const title = clean(input.title, 120) || null;
  const body = String(input.body ?? "").trim().slice(0, 2000);
  const email = clean(input.email, 200).toLowerCase() || user?.email || null;
  if (!reviewer_type) throw new Error("Tell us whether you're a tenant or a landlord.");
  if (!(rating >= 1 && rating <= 5)) throw new Error("Choose a rating from 1 to 5 stars.");
  if (!display_name) throw new Error("Add the name to show with your review.");
  if (body.length < 10) throw new Error("Write a few words about your experience.");
  if (!input.consent) throw new Error("Tick the box to let us publish your review.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Check the email address.");

  let verified = false;
  if (user?.id) {
    const q =
      reviewer_type === "tenant"
        ? admin.from("tenancy_tenants").select("tenancy_id", { count: "exact", head: true }).eq("profile_id", user.id)
        : admin.from("owners").select("id", { count: "exact", head: true }).eq("profile_id", user.id);
    const { count } = await q;
    verified = (count || 0) > 0;
  }
  if (email) {
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await admin.from("reviews").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", since);
    if ((count || 0) >= 3) throw new Error("Thanks, we already have your review. We'll publish it once it's checked.");
  }

  const { error } = await admin.from("reviews").insert({
    reviewer_type, rating, display_name, title, body, email, consent: true, profile_id: user?.id || null, verified,
  });
  if (error) throw new Error("Your review didn't save. Try again.");
  await sendMail({
    to: staffEmails(),
    subject: `New ${reviewer_type} review to approve: ${"★".repeat(rating)}${"☆".repeat(5 - rating)}`,
    lines: [
      `From: ${display_name}${verified ? " (verified " + reviewer_type + ")" : ""}${email ? ", " + email : ""}`,
      title ? `Title: ${title}` : "",
      body,
      "It won't appear on the website until someone approves it.",
    ].filter(Boolean),
    link: `${SITE_URL}/admin/reviews`,
    linkLabel: "Review it",
  }).catch(() => {});
  return { ok: true, verified };
}
