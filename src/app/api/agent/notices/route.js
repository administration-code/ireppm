import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest } from "@/lib/server-auth";
import { isServer, markDelivered, serveBoard, signedPdfUrl } from "@/lib/serve-notice";

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
  if (body.action === "deliver") {
    const out = await markDelivered(sb, partner, body);
    return NextResponse.json(out, { status: out.error ? 400 : 200 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
