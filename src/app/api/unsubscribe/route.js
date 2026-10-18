import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cleanEmail, validToken } from "@/lib/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/unsubscribe?e=&t=            one-click unsubscribe from mail apps (List-Unsubscribe-Post)
// POST /api/unsubscribe { e, t, action }  from the /unsubscribe page; action "out" (default) or "in"
export async function POST(request) {
  const url = new URL(request.url);
  let body = {};
  if ((request.headers.get("content-type") || "").includes("application/json")) {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }
  const email = cleanEmail(body.e || url.searchParams.get("e"));
  const token = String(body.t || url.searchParams.get("t") || "");
  const action = body.action === "in" ? "in" : "out";
  if (!validToken(email, token)) return NextResponse.json({ error: "This unsubscribe link isn't valid. Email us and we'll take you off the list." }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { error } =
    action === "out"
      ? await admin.from("email_optouts").upsert({ email, source: body.e ? "unsubscribe page" : "one-click" }, { onConflict: "email", ignoreDuplicates: true })
      : await admin.from("email_optouts").delete().eq("email", email);
  if (error) return NextResponse.json({ error: "That didn't save. Try again, or email us and we'll do it for you." }, { status: 500 });
  return NextResponse.json({ ok: true, unsubscribed: action === "out" });
}
