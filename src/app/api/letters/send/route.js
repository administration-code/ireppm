import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerLetterEmail } from "@/lib/letter-email";
import { SITE } from "@/lib/site";
import { mfaSatisfied } from "@/lib/staff-mfa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM = "IRep Property Management <statements@ireppm.ca>";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LETTERS = 300;

async function staffUser(sb, request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user || !mfaSatisfied(data.user, token)) return null;
  const { data: profile } = await sb.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return profile && ["staff", "admin"].includes(profile.role) ? data.user : null;
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  if (!(await staffUser(sb, request))) {
    return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const ids = [...new Set(Array.isArray(body?.ids) ? body.ids.map(String) : [])].filter((id) => UUID.test(id));
  if (!ids.length) return NextResponse.json({ error: "Choose at least one letter." }, { status: 400 });
  if (ids.length > MAX_LETTERS) return NextResponse.json({ error: "Too many letters at once." }, { status: 400 });
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email isn't set up yet (RESEND_API_KEY)." }, { status: 500 });
  }

  const { data: letters, error } = await sb
    .from("owner_letters")
    .select("id, owner_id, period, status, data, staff_note, owner:owners(name, email)")
    .in("id", ids)
    .eq("status", "draft");
  if (error) return NextResponse.json({ error: "We couldn't load those letters." }, { status: 500 });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const sent = [];
  const skipped = [];
  const failed = [];

  for (const letter of letters || []) {
    const to = String(letter.owner?.email || "").trim();
    const name = letter.owner?.name || letter.data?.owner?.name || "";
    if (!to) {
      skipped.push({ id: letter.id, name, reason: "no email on file" });
      continue;
    }

    // Claim the draft first so two clicks can't send it twice.
    const sentAt = new Date().toISOString();
    const { data: claimed } = await sb
      .from("owner_letters")
      .update({ status: "sent", sent_at: sentAt, sent_to: to })
      .eq("id", letter.id)
      .eq("status", "draft")
      .select("id");
    if (!claimed?.length) {
      skipped.push({ id: letter.id, name, reason: "already sent" });
      continue;
    }

    const { error: sendError } = await resend.emails.send({
      from: FROM,
      to: [to],
      replyTo: SITE.email,
      ...ownerLetterEmail(letter, name, to),
    });
    if (sendError) {
      console.error("[letters/send] send failed:", sendError.name || "", sendError.message || "");
      await sb.from("owner_letters").update({ status: "draft", sent_at: null, sent_to: null }).eq("id", letter.id);
      failed.push({ id: letter.id, name });
      continue;
    }
    sent.push({ id: letter.id, name, to });
  }

  const found = new Set((letters || []).map((l) => l.id));
  for (const id of ids) if (!found.has(id)) skipped.push({ id, name: "", reason: "not a draft" });

  return NextResponse.json({ sent, skipped, failed });
}
