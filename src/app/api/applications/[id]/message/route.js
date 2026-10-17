import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { SITE_URL, bearer, loadApplication, placeOf, sendMail, staffEmails, userClient } from "@/lib/application-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A message about one application, from the landlord, the applicant or staff.
// Everyone else involved gets an email. POST { body }
export async function POST(request, { params }) {
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await params;
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const text = String(payload?.body || "").trim().slice(0, 4000);
  if (!text) return NextResponse.json({ error: "Write a message first." }, { status: 400 });

  const sb = userClient(token);
  const { data: role } = await sb.rpc("application_role", { p_application_id: id });
  if (!role) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { error } = await sb.rpc("post_application_message", { p_application_id: id, p_body: text });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const admin = getSupabaseAdmin();
  const app = await loadApplication(admin, id);
  const place = placeOf(app?.listing);
  const sentToOwner = app?.owner_review_status && app.owner_review_status !== "not_sent";
  const from = role === "owner" ? "The landlord" : role === "applicant" ? app?.applicant_name || "The applicant" : "IRep";

  const jobs = [];
  if (role !== "applicant" && app?.applicant_email) {
    jobs.push(
      sendMail({
        to: app.applicant_email,
        subject: `New message about your application for ${place}`,
        lines: [`${from} wrote about your application for ${place}:`, text, "Reply from your profile."],
        link: `${SITE_URL}/account?tab=applications`,
        linkLabel: "Read and reply",
      })
    );
  }
  if (role !== "owner" && sentToOwner && app?.owner?.email) {
    jobs.push(
      sendMail({
        to: app.owner.email,
        subject: `New message about ${app.applicant_name}'s application for ${place}`,
        lines: [`${from} wrote:`, text],
        link: `${SITE_URL}/owner/applications`,
        linkLabel: "Open the application",
      })
    );
  }
  if (role !== "staff") {
    jobs.push(
      sendMail({
        to: staffEmails(),
        subject: `Application message: ${app?.applicant_name} for ${place}`,
        lines: [`${from} wrote:`, text],
        link: `${SITE_URL}/admin/requests?tab=applications`,
        linkLabel: "Open applications",
      })
    );
  }
  await Promise.all(jobs);
  return NextResponse.json({ ok: true });
}
