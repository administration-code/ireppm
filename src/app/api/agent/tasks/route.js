import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest } from "@/lib/server-auth";
import { partnerTaskDone, partnerTasks } from "@/lib/partner-tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agent portal: tasks from the office.  GET → { tasks }   POST { id, note? } → marks it done.
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({ tasks: await partnerTasks(sb, partner.id) });
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id, note } = await request.json().catch(() => ({}));
  const r = await partnerTaskDone(sb, partner, id, note);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
}
