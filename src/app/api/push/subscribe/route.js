import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest, userFromRequest } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Turn phone notifications on (POST { endpoint, keys: { p256dh, auth } }) or off (DELETE { endpoint }) for the
// signed-in person. Partners' phones are tied to their partner record, so their work alerts reach them.
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const who = await userFromRequest(sb, request);
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const endpoint = String(body?.endpoint || "");
  const p256dh = String(body?.keys?.p256dh || "");
  const auth = String(body?.keys?.auth || "");
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return NextResponse.json({ error: "That phone didn't give a subscription." }, { status: 400 });
  const partner = await partnerFromRequest(sb, request);
  const { error } = await sb
    .from("push_subscriptions")
    .upsert(
      { user_id: who.user.id, partner_id: partner?.id || null, endpoint, p256dh, auth, user_agent: (request.headers.get("user-agent") || "").slice(0, 300), last_error: null },
      { onConflict: "endpoint" }
    );
  if (error) return NextResponse.json({ error: "Couldn't turn notifications on. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const sb = getSupabaseAdmin();
  const who = await userFromRequest(sb, request);
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  await sb.from("push_subscriptions").delete().eq("endpoint", String(body?.endpoint || "")).eq("user_id", who.user.id);
  return NextResponse.json({ ok: true });
}
