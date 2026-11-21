import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { askIRep } from "@/lib/ai-assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Staff: Ask IRep / Draft with AI. Drafts and tasks only; nothing is sent.
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const staff = await staffFromRequest(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const question = String(body?.question || "").trim().slice(0, 4000);
  if (!question) return NextResponse.json({ error: "Type a question or what you'd like drafted." }, { status: 400 });
  try {
    const out = await askIRep(sb, { question, tenancyId: body?.tenancy_id || null, userId: staff.id });
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
