import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { notifyOwnerMoveOut } from "@/lib/owner-move-out";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Staff recorded a notice to end the tenancy (any reason): email the landlord the move-out date.
// POST { note? }  The tenancy must already be on notice.
export async function POST(request, { params }) {
  const sb = getSupabaseAdmin();
  if (!(await staffFromRequest(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { data: t } = await sb.from("tenancies").select("id, status, move_out_date").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (t.status !== "notice") return NextResponse.json({ error: "Record the notice first." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";
  const r = await notifyOwnerMoveOut(id, { stage: "on_notice", date: t.move_out_date, reason: note || undefined });
  if (!r.sent) return NextResponse.json({ error: "The landlord couldn't be emailed. Check there's an email on file." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
