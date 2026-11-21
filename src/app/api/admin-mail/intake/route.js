import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { aiConfigured, classifyEmail, redact } from "@/lib/ai";
import { INTAKE_BUCKET, processInbound } from "@/lib/email-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function secretMatches(provided) {
  const expected = process.env.INBOUND_MAIL_SECRET;
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
const clip = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const MEDIA = /^(image|video)\//;
const MAX_FILE = 50 * 1024 * 1024;

// The administration@ mailbox script posts each new email here.
//   POST { message_id, from_name, from_email, subject, body, received_at, attachments: [{ name, type, size }] }
//     → saves it, sorts it (rent, tenant issue, landlord, maintenance, PayProp, other), and returns a
//       signed upload URL for each photo or video. With no files, maintenance intake runs right away.
//   POST { message_id, done: true } once the files are uploaded → runs maintenance intake.
export async function POST(request) {
  if (!secretMatches(request.headers.get("x-mail-secret"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  if (body.ping) return NextResponse.json({ ok: true, ping: true });
  const messageId = clip(body.message_id, 200);
  if (!messageId) return NextResponse.json({ error: "Missing message_id" }, { status: 400 });
  const sb = getSupabaseAdmin();

  if (body.done) {
    const { data: row } = await sb.from("inbound_emails").select("id").eq("message_id", messageId).maybeSingle();
    if (!row) return NextResponse.json({ error: "Unknown email" }, { status: 404 });
    const out = await processInbound(sb, row.id).catch((err) => ({ error: String(err?.message || err) }));
    return NextResponse.json({ ok: true, intake: out });
  }

  const files = (Array.isArray(body.attachments) ? body.attachments : [])
    .filter((a) => MEDIA.test(String(a?.type || "")) && Number(a?.size || 0) > 0 && Number(a.size) <= MAX_FILE)
    .slice(0, 8);
  const row = {
    message_id: messageId,
    from_name: clip(body.from_name, 200),
    from_email: clip(body.from_email, 200)?.toLowerCase() || null,
    // ID, licence and bank-style numbers are never stored.
    subject: clip(redact(body.subject || ""), 300),
    snippet: clip(redact(body.body || body.snippet || ""), 1500),
    body: clip(redact(body.body || body.snippet || ""), 8000),
    received_at: new Date(body.received_at || Date.now()).toISOString(),
    intake_status: files.length ? "waiting_files" : "none",
  };
  const { data, error } = await sb.from("inbound_emails").insert(row).select("id").single();
  if (error?.code === "23505") return NextResponse.json({ ok: true, duplicate: true, uploads: [] });
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  const uploads = [];
  const attachments = [];
  for (const [i, f] of files.entries()) {
    const safe = String(f.name || `file-${i + 1}`).replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `email/${data.id}/${i + 1}-${safe}`;
    const { data: signed } = await sb.storage.from(INTAKE_BUCKET).createSignedUploadUrl(path);
    if (signed?.signedUrl) {
      uploads.push({ name: f.name, url: signed.signedUrl, type: f.type });
      attachments.push({ name: f.name, path });
    }
  }
  if (attachments.length) await sb.from("inbound_emails").update({ attachments }).eq("id", data.id);

  if (aiConfigured()) {
    try {
      const c = await classifyEmail(sb, { from: `${row.from_name || ""} <${row.from_email || ""}>`, subject: row.subject, snippet: row.snippet });
      await sb.from("inbound_emails").update({ ...c, classified_at: new Date().toISOString() }).eq("id", data.id);
    } catch (err) {
      console.error("[admin-mail] classify failed:", err?.message || err);
    }
  }
  let intake = null;
  if (!uploads.length) intake = await processInbound(sb, data.id).catch((err) => ({ error: String(err?.message || err) }));
  return NextResponse.json({ ok: true, uploads, intake });
}
