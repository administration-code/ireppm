import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { redact } from "@/lib/ai";
import { INTAKE_BUCKET, processInbound } from "@/lib/email-intake";
import { idLikeAttachment, isAutomatedAddress, isAutoReply, labelEmail, matchParty, otherParty, skipLogging } from "@/lib/comms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function secretMatches(provided) {
  // Trimmed on both sides: a space or line break picked up when pasting the value shouldn't break it.
  const expected = (process.env.INBOUND_MAIL_SECRET || "").trim();
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
const clip = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const MEDIA = /^(image|video)\//;
const MAX_FILE = 50 * 1024 * 1024;
const INTERAC = /interac\.ca/i;
const UUID = /^[0-9a-f-]{36}$/i;

// The administration@ mailbox script posts every email received and sent here (Interac notices excluded).
//   POST { message_id, thread_id, direction: "in"|"out", draft_id?, from_name, from_email, to_emails[],
//          subject, body, received_at, attachments: [{ name, type, size }] }
//     → stores it on the Communications timeline (matched to the tenant, landlord, applicant or partner,
//       labelled), and for possible maintenance emails returns a signed upload URL per photo or video.
//       Attachments that look like ID or licences are never uploaded or shown.
//   POST { message_id, done: true } once the files are uploaded → runs maintenance intake.
//   backfill: true (the one-time load of older mail) → filed only: saved as handled, labelled by rules (no AI),
//     automated mail skipped, no photo uploads, no maintenance requests, no alerts.
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

  const direction = body.direction === "out" ? "out" : "in";
  const fromEmail = clip(body.from_email, 200)?.toLowerCase() || null;
  if (INTERAC.test(fromEmail || "")) return NextResponse.json({ ok: true, skipped: "interac", uploads: [] });
  const toEmails = (Array.isArray(body.to_emails) ? body.to_emails : []).map((e) => String(e).trim().toLowerCase()).filter((e) => e.includes("@")).slice(0, 30);
  const threadId = clip(body.thread_id, 200);
  // IRep's automatic "We've received your message" replies aren't kept: they'd clutter the timeline
  // and count as answering the tenant.
  if (direction === "out" && isAutoReply(body.subject)) return NextResponse.json({ ok: true, skipped: "auto-reply", uploads: [] });
  const backfill = body.backfill === true;
  if (backfill && (body.automated || isAutomatedAddress(fromEmail))) return NextResponse.json({ ok: true, skipped: "automated", uploads: [] });
  // DocuSign status mail, receipts and security codes aren't kept (approved by Rosie, Nov 21 2026).
  if (direction === "in") {
    const why = skipLogging({ from_email: fromEmail, subject: body.subject, automated: Boolean(body.automated) });
    if (why) return NextResponse.json({ ok: true, skipped: why, uploads: [] });
  }

  // A template email sent from the portal is already on the timeline: link it to its Gmail copy.
  if (direction === "out" && UUID.test(String(body.draft_id || ""))) {
    const { data: logged } = await sb.from("inbound_emails").select("id").eq("draft_id", body.draft_id).maybeSingle();
    if (logged) {
      await sb.from("inbound_emails").update({ message_id: messageId, thread_id: threadId }).eq("id", logged.id);
      return NextResponse.json({ ok: true, linked: true, uploads: [] });
    }
  }

  // An email the portal logged itself when sending (message_id "pre-…", e.g. the URGENT old-address
  // e-Transfer email): link it to its Gmail copy instead of adding a second entry.
  if (direction === "out") {
    const at = new Date(body.received_at || Date.now()).getTime();
    const { data: pre } = await sb
      .from("inbound_emails")
      .select("id, to_emails")
      .like("message_id", "pre-%")
      .eq("direction", "out")
      .eq("subject", clip(redact(body.subject || ""), 300) || "")
      .gte("received_at", new Date(at - 30 * 60000).toISOString())
      .lte("received_at", new Date(at + 30 * 60000).toISOString())
      .limit(5);
    const hit = (pre || []).find((r) => (r.to_emails || []).some((e) => toEmails.includes(e)));
    if (hit) {
      await sb.from("inbound_emails").update({ message_id: messageId, thread_id: threadId }).eq("id", hit.id);
      return NextResponse.json({ ok: true, linked: true, uploads: [] });
    }
  }

  const text = clip(redact(body.body || body.snippet || ""), 8000);
  const base = {
    message_id: messageId,
    thread_id: threadId,
    direction,
    from_name: clip(body.from_name, 200),
    from_email: fromEmail,
    to_emails: toEmails,
    // ID, licence and bank-style numbers are never stored.
    subject: clip(redact(body.subject || ""), 300),
    snippet: text ? text.slice(0, 1500) : null,
    body: text,
    received_at: new Date(body.received_at || Date.now()).toISOString(),
    status: direction === "out" || backfill ? "handled" : "new",
  };
  const party = await matchParty(sb, otherParty(base));
  const label = await labelEmail(sb, base, party, { ai: !backfill });

  const all = (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 12);
  const hidden = all.filter(idLikeAttachment);
  const maybeMaintenance = !backfill && direction === "in" && (label.category === "maintenance" || (party.party_kind === "tenant" && label.category !== "rent"));
  const files = maybeMaintenance
    ? all.filter((a) => !idLikeAttachment(a) && MEDIA.test(String(a?.type || "")) && Number(a?.size || 0) > 0 && Number(a.size) <= MAX_FILE).slice(0, 8)
    : [];
  const row = {
    ...base,
    ...party,
    ...label,
    hidden_attachments: hidden.length,
    attachments: all.map((a) => (idLikeAttachment(a) ? { hidden: true } : { name: String(a.name || "").slice(0, 120), type: a.type || null })),
    intake_status: files.length ? "waiting_files" : "none",
  };
  const { data, error } = await sb.from("inbound_emails").insert(row).select("id").single();
  if (error?.code === "23505") return NextResponse.json({ ok: true, duplicate: true, uploads: [] });
  if (error) {
    console.error("[admin-mail] save failed:", error.message);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  if (direction === "out") await matchPortalSend(sb, data.id, base).catch(() => {});

  const uploads = [];
  const stored = [];
  for (const [i, f] of files.entries()) {
    const safe = String(f.name || `file-${i + 1}`).replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `email/${data.id}/${i + 1}-${safe}`;
    const { data: signed } = await sb.storage.from(INTAKE_BUCKET).createSignedUploadUrl(path);
    if (signed?.signedUrl) {
      uploads.push({ name: f.name, url: signed.signedUrl, type: f.type });
      stored.push({ name: f.name, path });
    }
  }
  if (stored.length) {
    const attachments = row.attachments.map((a) => stored.find((s) => s.name === a.name) || a);
    await sb.from("inbound_emails").update({ attachments }).eq("id", data.id);
  }

  let intake = null;
  if (maybeMaintenance && !uploads.length) intake = await processInbound(sb, data.id).catch((err) => ({ error: String(err?.message || err) }));
  return NextResponse.json({ ok: true, uploads, intake, party: party.party_kind, label: label.category });
}

// The Gmail copy of an email the portal sent: same subject, a shared recipient, within 30 minutes.
// Tags it "Portal" on the timeline and links the two. Quietly does nothing before migration 0096.
async function matchPortalSend(sb, emailId, base) {
  const at = new Date(base.received_at).getTime();
  const { data: sends } = await sb
    .from("portal_sent")
    .select("id, to_emails, cc_emails")
    .eq("subject", base.subject || "")
    .is("inbound_email_id", null)
    .gte("sent_at", new Date(at - 30 * 60000).toISOString())
    .lte("sent_at", new Date(at + 30 * 60000).toISOString())
    .order("sent_at", { ascending: false })
    .limit(10);
  const to = new Set(base.to_emails || []);
  const hit = (sends || []).find((s) => [...(s.to_emails || []), ...(s.cc_emails || [])].some((e) => to.has(e))) || (sends || [])[0];
  if (!hit) return;
  await sb.from("portal_sent").update({ inbound_email_id: emailId }).eq("id", hit.id);
  await sb.from("inbound_emails").update({ via_portal: true }).eq("id", emailId);
}
