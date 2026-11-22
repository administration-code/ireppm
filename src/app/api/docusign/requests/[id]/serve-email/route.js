import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffUser } from "@/lib/signatures-server";
import { emailServe } from "@/lib/serve-notice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Staff: serve a signed N4, N5 or N1 by email to tenants who consented in writing, record it, and send the
// Certificate of Service to Rishi to sign.
export async function POST(request, { params }) {
  const { id } = await params;
  const sb = getSupabaseAdmin();
  const staff = await staffUser(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const out = await emailServe(sb, id);
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
