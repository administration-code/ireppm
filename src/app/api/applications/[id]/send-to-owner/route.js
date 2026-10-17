import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffUser } from "@/lib/signatures-server";
import { SITE_URL, loadApplication, placeOf, sendMail } from "@/lib/application-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff send an application to the property's owner for approval.
export async function POST(request, { params }) {
  const admin = getSupabaseAdmin();
  const staff = await staffUser(admin, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { id } = await params;

  const { data: owner, error } = await admin.rpc("send_application_to_owner", { p_application_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const app = await loadApplication(admin, id);
  const place = placeOf(app?.listing);
  await sendMail({
    to: owner.owner_email,
    subject: `Applicant ready for your review: ${place}`,
    lines: [
      `Hi ${owner.owner_name},`,
      `${app?.applicant_name || "An applicant"} has applied for ${place}. Their application, supporting documents, references and credit check are ready for you to review.`,
      "Please approve, decline or send them a question. We won't accept any applicant without your approval.",
      owner.owner_linked
        ? "Sign in with this email address to see it."
        : "Sign in with this email address (we'll email you a sign-in link, no password needed). Your owner portal opens automatically.",
    ],
    link: `${SITE_URL}/owner/applications`,
    linkLabel: "Review the applicant",
  });

  return NextResponse.json({ ok: true, owner });
}
