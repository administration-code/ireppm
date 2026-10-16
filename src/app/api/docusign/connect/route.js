import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { EVENT_STATUS, syncRequest } from "@/lib/signatures-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verified(raw, request) {
  const key = (process.env.DOCUSIGN_CONNECT_HMAC_KEY || "").trim();
  if (!key) return false;
  const expected = Buffer.from(createHmac("sha256", key).update(raw, "utf8").digest("base64"));
  return ["x-docusign-signature-1", "x-docusign-signature-2"].some((h) => {
    const given = Buffer.from((request.headers.get(h) || "").trim());
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export async function POST(request) {
  const raw = await request.text();
  if (!verified(raw, request)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const event = String(body?.event || "");
  const envelopeId = body?.data?.envelopeId;
  if (!envelopeId) return NextResponse.json({ ok: true });

  const sb = getSupabaseAdmin();
  const { data: row } = await sb.from("signature_requests").select("*").eq("envelope_id", envelopeId).maybeSingle();

  const recipientId = body?.data?.recipientId || "";
  const recipientEmail =
    (body?.data?.envelopeSummary?.recipients?.signers || []).find((s) => s.recipientId === recipientId)?.email || null;
  await sb.from("signature_events").upsert(
    {
      signature_request_id: row?.id || null,
      envelope_id: envelopeId,
      event: event || "unknown",
      recipient_email: recipientEmail,
      occurred_at: body?.generatedDateTime || new Date().toISOString(),
      dedupe_key: `${envelopeId}|${event}|${recipientId}|${body?.generatedDateTime || ""}`,
      payload: { event, data: { envelopeId, recipientId }, generatedDateTime: body?.generatedDateTime },
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true }
  );

  if (row) {
    try {
      await syncRequest(sb, row, { eventStatus: EVENT_STATUS[event] });
    } catch (err) {
      console.error("[docusign] connect sync failed:", err?.message || err);
    }
  }
  return NextResponse.json({ ok: true });
}
