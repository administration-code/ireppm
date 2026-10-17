import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffUser } from "@/lib/signatures-server";
import { inviteCandidates, sendInvites } from "@/lib/portal-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const admin = getSupabaseAdmin();
  if (!(await staffUser(admin, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  try {
    return NextResponse.json(await inviteCandidates(admin));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const admin = getSupabaseAdmin();
  if (!(await staffUser(admin, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const ids = (v) => (Array.isArray(v) ? v.filter((x) => /^[0-9a-f-]{36}$/i.test(String(x))).slice(0, 200) : []);
  return NextResponse.json(await sendInvites(admin, { owners: ids(body.owners), tenants: ids(body.tenants) }));
}
