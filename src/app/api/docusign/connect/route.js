import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { EVENT_STATUS, syncRequest } from "@/lib/signatures-server";
import { syncOutstanding } from "@/lib/signatures-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// DocuSign Connect: DocuSign calls this when an envelope is sent, viewed, signed, declined or voided.
// The message itself is only trusted when its HMAC signature checks out. Otherwise it's treated as a
// nudge: we read the envelope's real status straight from DocuSign, so a forged call can't change anything.
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
  const trusted = verified(raw, request);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const event = String(body?.event || "");
  const envelopeId = String(body?.data?.envelopeId || "");
  if (!/^[0-9a-f-]{36}$/i.test(envelopeId)) return NextResponse.json({ ok: true });

  const sb = getSupabaseAdmin();
  const { data: row } = await sb.from("signature_requests").select("*").eq("envelope_id", envelopeId).maybeSingle();

  if (trusted) {
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
  }

  try {
    if (row) await syncRequest(sb, row, trusted ? { eventStatus: EVENT_STATUS[event] } : {});
    else await syncOutstanding(sb); // an envelope made directly in DocuSign: add it to the list
  } catch (err) {
    console.error("[docusign] connect sync failed:", err?.message || err);
  }
  return NextResponse.json({ ok: true });
}
