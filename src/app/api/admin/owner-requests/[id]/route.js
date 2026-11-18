import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { kindLabel } from "@/lib/owner-requests";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH { status: "done" | "open", reply?, email? }  Staff answer a landlord's request.
// email: true sends the reply to the landlord's email on file (only when staff tick it).
export async function PATCH(request, { params }) {
  const sb = getSupabaseAdmin();
  const staff = await staffFromRequest(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const status = body?.status === "open" ? "open" : "done";
  const reply = typeof body?.reply === "string" ? body.reply.trim().slice(0, 4000) : "";

  const { data: r } = await sb
    .from("owner_requests")
    .select("id, kind, period, message, owner:owners(name, email), property:properties(address)")
    .eq("id", id)
    .maybeSingle();
  if (!r) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let emailed = false;
  if (body?.email && status === "done") {
    if (!reply) return NextResponse.json({ error: "Write the reply to email it." }, { status: 400 });
    if (!r.owner?.email) return NextResponse.json({ error: "This landlord has no email on file." }, { status: 400 });
    if (!mailConfigured()) return NextResponse.json({ error: "Email isn't set up." }, { status: 500 });
    const heading = "Your Information Request";
    const rows = [
      ["You asked for", kindLabel(r.kind)],
      ...(r.property?.address ? [["Property", r.property.address]] : []),
      ["Our reply", reply],
    ];
    const link = { href: "https://ireppm.ca/owner#requests", label: "Open your owner portal" };
    const { error } = await mailer().emails.send({
      from: "IRep Property Management <statements@ireppm.ca>",
      to: [r.owner.email],
      replyTo: SITE.email,
      subject: `Re: ${kindLabel(r.kind)}`,
      html: renderEmail({ heading, intro: `Hi ${r.owner.name || ""}, here is our reply to your request.`, rows, link }),
      text: renderText({ heading, rows, link }),
    });
    if (error) return NextResponse.json({ error: "The email didn't send. Nothing was changed." }, { status: 502 });
    emailed = true;
  }

  const patch =
    status === "done"
      ? { status, staff_reply: reply || null, done_at: new Date().toISOString(), done_by: staff.id, ...(emailed ? { replied_by_email: true } : {}) }
      : { status, done_at: null, done_by: null };
  const { error } = await sb.from("owner_requests").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "That didn't save." }, { status: 500 });
  return NextResponse.json({ ok: true, emailed });
}
