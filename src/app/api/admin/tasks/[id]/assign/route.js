import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { SITE } from "@/lib/site";
import { assignToPartner } from "@/lib/partner-tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff: assign a task to a staff member (or unassign). The person gets a short email (task title and a link);
// everything else stays in the portal.   POST { assigned_to: uuid | null, clear_partner? } or { partner_id }
export async function POST(request, { params }) {
  const sb = getSupabaseAdmin();
  const staff = await staffFromRequest(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  // Chuck (or another partner): the task shows in their agent portal.
  if (body.partner_id) {
    const r = await assignToPartner(sb, id, body.partner_id, staff.id);
    return NextResponse.json(r, { status: r.error ? 400 : 200 });
  }
  const to = body.assigned_to || null;
  let person = null;
  if (to) {
    const { data } = await sb.from("profiles").select("id, full_name, email, role").eq("id", to).maybeSingle();
    if (!data || !["staff", "admin"].includes(data.role)) return NextResponse.json({ error: "That person isn't staff." }, { status: 400 });
    person = data;
  }
  const { data: task, error } = await sb
    .from("staff_tasks")
    .update({ assigned_to: to, assigned_by: staff.id, assigned_at: to ? new Date().toISOString() : null, ...(body.clear_partner ? { partner_id: null } : {}) })
    .eq("id", id)
    .select("id, title, due_date")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (person?.email && person.id !== staff.id && mailConfigured()) {
    const { data: me } = await sb.from("profiles").select("full_name").eq("id", staff.id).maybeSingle();
    const link = { href: "https://ireppm.ca/admin/tasks", label: "Open My Tasks" };
    const rows = [["Task", task.title], ["Assigned by", me?.full_name || "IRep staff"], ...(task.due_date ? [["Due", task.due_date]] : [])];
    await mailer()
      .emails.send({
        from: "IRep Property Management <alerts@ireppm.ca>",
        to: [person.email],
        replyTo: SITE.email,
        subject: `New task for you: ${task.title}`.slice(0, 150),
        html: renderEmail({ heading: "New Task", intro: `Hi ${String(person.full_name || "").split(" ")[0] || "there"}, a task was assigned to you in the IRep portal.`, rows, link }),
        text: renderText({ heading: "New Task", rows, link }),
      })
      .catch((err) => console.error("[tasks] assign email failed:", err?.message || err));
  }
  return NextResponse.json({ ok: true });
}
