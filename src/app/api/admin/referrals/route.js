import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffUser } from "@/lib/signatures-server";
import { createReferral, creditReferral, declineReferral, listReferrals, updateReferral } from "@/lib/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const admin = getSupabaseAdmin();
  if (!(await staffUser(admin, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  try {
    return NextResponse.json(await listReferrals(admin));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const admin = getSupabaseAdmin();
  if (!(await staffUser(admin, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const okId = /^[0-9a-f-]{36}$/i.test(String(b.id || ""));
  try {
    if (b.action === "create") await createReferral(admin, b);
    else if (!okId) return NextResponse.json({ error: "Missing referral." }, { status: 400 });
    else if (b.action === "update") await updateReferral(admin, b.id, b);
    else if (b.action === "credit") return NextResponse.json(await creditReferral(admin, b.id, { propertyId: b.propertyId, period: b.period }));
    else if (b.action === "decline") await declineReferral(admin, b.id, b.note);
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
