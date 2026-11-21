import { NextResponse } from "next/server";
import { logSentEmail } from "@/lib/comms-log";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { mailer, mailConfigured } from "@/lib/mailer";
import { escapeHtml } from "@/lib/staff-alerts";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = "IRep Property Management <administration@ireppm.ca>";

// Staff: send a reviewed draft from administration@ireppm.ca, copying administration@.
export async function POST(request, { params }) {
  const { id } = await params;
  if (!UUID.test(String(id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const sb = getSupabaseAdmin();
  const staff = await staffFromRequest(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  if (!mailConfigured()) return NextResponse.json({ error: "Email isn't set up." }, { status: 500 });
  const { data: d } = await sb.from("email_drafts").select("*").eq("id", id).maybeSingle();
  if (!d) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (d.status !== "draft") return NextResponse.json({ error: "This email was already sent or discarded." }, { status: 400 });
  const to = (d.to_emails || []).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL.test(e));
  if (!to.length) return NextResponse.json({ error: "Add at least one recipient." }, { status: 400 });
  if (!d.subject.trim() || !d.body.trim()) return NextResponse.json({ error: "Add a subject and a message." }, { status: 400 });
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#161616">${d.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;white-space:pre-line">${escapeHtml(p)}</p>`)
    .join("")}</div>`;
  const { error } = await mailer().emails.send({
    from: FROM,
    to,
    cc: to.includes(SITE.email) ? undefined : [SITE.email],
    replyTo: SITE.email,
    subject: d.subject,
    html,
    text: d.body,
    // Lets the mailbox feed link Gmail's copy to the timeline entry below.
    headers: { "X-IRep-Draft": d.id },
  });
  if (error) return NextResponse.json({ error: "The email didn't send. Nothing was changed." }, { status: 502 });
  await sb.from("email_drafts").update({ status: "sent", sent_at: new Date().toISOString(), sent_by: staff.id }).eq("id", id);
  await logSentEmail(sb, d, to).catch((err) => console.error("[emails] timeline log failed:", err?.message || err));
  if (d.task_id) await sb.from("staff_tasks").update({ status: "done", done_at: new Date().toISOString(), done_by: staff.id }).eq("id", d.task_id);
  return NextResponse.json({ sent: true, to });
}
