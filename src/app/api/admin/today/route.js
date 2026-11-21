import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { buildToday } from "@/lib/today";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff: the start-of-day list as JSON (sections of short lines) plus the same as plain text.
export async function GET(request) {
  const sb = getSupabaseAdmin();
  if (!(await staffFromRequest(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  try {
    const today = await buildToday(sb);
    let summary = null;
    if (new URL(request.url).searchParams.get("summary") === "1") {
      const { todaySummary } = await import("@/lib/ai");
      summary = await todaySummary(sb, today.text).catch(() => null);
    }
    return NextResponse.json({ ...today, summary });
  } catch (err) {
    console.error("[today] failed:", err?.message || err);
    return NextResponse.json({ error: "We couldn't build today's list." }, { status: 500 });
  }
}
