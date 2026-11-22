import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffUser, syncRequest } from "@/lib/signatures-server";
import { certificateSigningUrl, emailServe, servingBoard } from "@/lib/serve-notice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Staff Email Service page.
//   GET → { toSend, toSign }
//   POST { action: "send", id, signer_name }   serve a signed notice by email (the sender signs the certificate)
//   POST { action: "sign", id }                → { url } to sign a certificate in DocuSign, inside the portal
//   POST { action: "refresh", id }             update a certificate's status after signing
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const staff = await staffUser(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  return NextResponse.json(await servingBoard(sb, staff));
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const staff = await staffUser(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  let out;
  if (body.action === "send") out = await emailServe(sb, id, { name: String(body.signer_name || staff.full_name || ""), email: staff.email });
  else if (body.action === "sign") {
    const origin = new URL(request.url).origin;
    out = await certificateSigningUrl(sb, staff, id, `${origin}/admin/serving?signed=${id}`).catch((err) => ({ error: err.message }));
  } else if (body.action === "refresh") {
    const { data: row } = await sb.from("signature_requests").select("*").eq("id", id).maybeSingle();
    out = row ? { ok: true, status: (await syncRequest(sb, row))?.status } : { error: "Not found." };
  } else out = { error: "Unknown action." };
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
