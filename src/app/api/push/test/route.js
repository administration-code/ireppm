import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { userFromRequest } from "@/lib/server-auth";
import { pushTo } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sends a test notification to the signed-in person's own phones.
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const who = await userFromRequest(sb, request);
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const out = await pushTo(sb, { userId: who.user.id }, { title: "IRep notifications are on", body: "You'll get alerts like this for new jobs and notices to serve.", url: "/agent" });
  return NextResponse.json(out);
}
