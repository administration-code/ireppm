import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { SITE_URL, bearer, loadApplication, placeOf, sendMail, staffEmails, userClient } from "@/lib/application-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LABEL = { approved: "approved", declined: "declined", info_requested: "asked for more information about" };

// The landlord (or staff on their behalf) approves, declines or asks the applicant a question.
// POST { decision: 'approved' | 'declined' | 'info_requested', note }
export async function POST(request, { params }) {
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const decision = String(body?.decision || "");
  const note = String(body?.note || "").trim().slice(0, 4000);

  const sb = userClient(token);
  const { data: role } = await sb.rpc("application_role", { p_application_id: id });
  if (!["owner", "staff"].includes(role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { error } = await sb.rpc("owner_decide_application", { p_application_id: id, p_decision: decision, p_note: note || null });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const admin = getSupabaseAdmin();
  const app = await loadApplication(admin, id);
  const place = placeOf(app?.listing);
  const who = role === "owner" ? app?.owner?.name || "The landlord" : "IRep staff";

  await sendMail({
    to: staffEmails(),
    subject: `Landlord ${decision === "approved" ? "approved" : decision === "declined" ? "declined" : "has a question"}: ${app?.applicant_name} for ${place}`,
    lines: [
      `${who} ${LABEL[decision]} ${app?.applicant_name}'s application for ${place}.`,
      note ? `${decision === "info_requested" ? "Question" : "Note"}: ${note}` : "",
      decision === "approved"
        ? "Next: accept the application and send the lease."
        : decision === "declined"
          ? "Next: let the applicant know and decline the application."
          : "The question has been sent to the applicant. We'll tell you and the landlord when they answer.",
    ],
    link: `${SITE_URL}/admin/requests?tab=applications`,
    linkLabel: "Open applications",
  });

  if (decision === "info_requested" && app?.applicant_email) {
    await sendMail({
      to: app.applicant_email,
      subject: `A question about your application for ${place}`,
      lines: [
        `Hi ${app.applicant_name},`,
        `The landlord for ${place} has a question about your application:`,
        note,
        "Please answer from your profile so we can keep your application moving.",
      ],
      link: `${SITE_URL}/account?tab=applications`,
      linkLabel: "Answer the question",
    });
  }
  return NextResponse.json({ ok: true });
}
