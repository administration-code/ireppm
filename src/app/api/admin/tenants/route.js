import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffUser } from "@/lib/signatures-server";
import { sendInvites } from "@/lib/portal-invites";
import { sendLeaseEndEmail, sendWelcome } from "@/lib/tenant-notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Emails from Manage Tenants (staff only).
// POST { action: "invite", tenantId }     portal invitation to one tenant (skipped if they already have an account)
// POST { action: "welcome", tenancyId }   the move-in welcome email to everyone on the tenancy
// POST { action: "lease-end", tenancyId } what happens when the lease term ends (month to month, new lease or N9)
export async function POST(request) {
  const admin = getSupabaseAdmin();
  if (!(await staffUser(admin, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body.action === "invite" && UUID.test(String(body.tenantId))) {
    const r = await sendInvites(admin, { tenants: [body.tenantId] });
    if (!r.sent) return NextResponse.json({ error: "The invitation didn't go out. They may already have an account, have no email, be unassigned, or have unsubscribed." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "welcome" && UUID.test(String(body.tenancyId))) {
    const r = await sendWelcome(admin, body.tenancyId, { remindStaff: false });
    if (!r?.sent) return NextResponse.json({ error: "The welcome email didn't go out. Check the tenants on this tenancy have an email address." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "lease-end" && UUID.test(String(body.tenancyId))) {
    try {
      return NextResponse.json(await sendLeaseEndEmail(admin, body.tenancyId));
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }
  return NextResponse.json({ error: "Bad request." }, { status: 400 });
}
