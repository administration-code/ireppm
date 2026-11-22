import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest } from "@/lib/server-auth";
import { CHUCK_EMAILS, certificateSigningUrl, isServer, markDelivered, serveBoard, signedPdfUrl } from "@/lib/serve-notice";
import { syncRequest } from "@/lib/signatures-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Agent Portal, for the person who serves notices (Chuck).
//   GET → { allowed, toServe, toSign }
//   POST { action: "pdf", id } → { url }   (the signed notice, link valid 10 minutes)
//   POST { action: "deliver", id, served_on, method, details?, mail_address?, fax_number? }
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!isServer(partner)) return NextResponse.json({ allowed: false });
  return NextResponse.json({ allowed: true, ...(await serveBoard(sb)) });
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!isServer(partner)) return NextResponse.json({ error: "Your account isn't set up to serve notices." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (body.action === "pdf") {
    const url = await signedPdfUrl(sb, String(body.id || ""));
    return url ? NextResponse.json({ url }) : NextResponse.json({ error: "The signed copy isn't available. Ask Rosie." }, { status: 404 });
  }
  if (body.action === "sign") {
    const origin = new URL(request.url).origin;
    const out = await certificateSigningUrl(sb, null, String(body.id || ""), `${origin}/agent/notices?signed=${body.id}`, CHUCK_EMAILS).catch((err) => ({ error: err.message }));
    return NextResponse.json(out, { status: out.error ? 400 : 200 });
  }
  if (body.action === "refresh") {
    const { data: row } = await sb.from("signature_requests").select("*").eq("id", String(body.id || "")).eq("kind", "certificate_of_service").maybeSingle();
    if (row) await syncRequest(sb, row).catch(() => null);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "deliver") {
    const out = await markDelivered(sb, partner, body);
    return NextResponse.json(out, { status: out.error ? 400 : 200 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
