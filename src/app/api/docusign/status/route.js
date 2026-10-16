import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { templateStatus } from "@/lib/docusign";
import { staffUser } from "@/lib/signatures-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const sb = getSupabaseAdmin();
  if (!(await staffUser(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  return NextResponse.json(await templateStatus());
}
