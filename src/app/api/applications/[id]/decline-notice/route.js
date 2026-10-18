import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffUser } from "@/lib/signatures-server";
import { SITE_URL, loadApplication, placeOf, sendMail } from "@/lib/application-review";
import { DECLINE_REASONS, declineLines } from "@/lib/decline-notice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff tell a declined applicant, with the Consumer Reporting Act notice when a credit report or
// other outside information played a part. POST { reasons: ["credit" | "other" | "neither", ...], send: true }
export async function POST(request, { params }) {
  const admin = getSupabaseAdmin();
  if (!(await staffUser(admin, request))) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const reasons = [...new Set((Array.isArray(body?.reasons) ? body.reasons : []).filter((r) => r in DECLINE_REASONS))];
  if (!reasons.length) return NextResponse.json({ error: "Say what the decision relied on." }, { status: 400 });

  const app = await loadApplication(admin, id);
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (app.status !== "declined") return NextResponse.json({ error: "Set the application to Declined first." }, { status: 400 });

  let sent = false;
  if (body?.send !== false && app.applicant_email) {
    const r = await sendMail({
      to: app.applicant_email,
      subject: `Your application for ${placeOf(app.listing)}`,
      lines: declineLines({ name: app.applicant_name, place: placeOf(app.listing), reasons }),
      link: `${SITE_URL}/properties`,
      linkLabel: "See available rentals",
    });
    sent = Boolean(r.sent);
    if (!sent) return NextResponse.json({ error: "The email didn't send. Try again." }, { status: 502 });
  }
  await admin
    .from("applications")
    .update({ decline_reasons: reasons, ...(sent ? { decline_notice_sent_at: new Date().toISOString() } : {}) })
    .eq("id", id);
  return NextResponse.json({ ok: true, sent });
}
