import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { matchCashDeposits } from "@/lib/cash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff: match Chuck's logged bank deposits to imported bank lines (run when the Cash page opens).
export async function POST(request) {
  const sb = getSupabaseAdmin();
  if (!(await staffFromRequest(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  return NextResponse.json(await matchCashDeposits(sb));
}
