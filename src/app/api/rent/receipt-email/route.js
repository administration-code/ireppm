import { NextResponse } from "next/server";
import { mailer, mailConfigured } from "@/lib/mailer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadReceipt, receiptParams } from "@/lib/receipt";
import { receiptEmail } from "@/lib/receipt-email";
import { SITE } from "@/lib/site";
import { mfaSatisfied } from "@/lib/staff-mfa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM = "IRep Property Management <receipts@ireppm.ca>";

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

  const params = receiptParams(body || {});
  const to = String(body?.to || "").trim().toLowerCase();
  if (!params || !to) return NextResponse.json({ error: "Choose a receipt and a tenant." }, { status: 400 });
  if (!mailConfigured()) {
    return NextResponse.json({ error: "Email isn't set up yet (GMAIL_APP_PASSWORD)." }, { status: 500 });
  }

  let receipt;
  try {
    receipt = await loadReceipt(sb, params);
  } catch {
    return NextResponse.json({ error: "We couldn't load that receipt." }, { status: 500 });
  }
  if (!receipt || !receipt.payments.length) {
    return NextResponse.json({ error: "There are no payments on this receipt." }, { status: 404 });
  }

  // Only send to an email address on file for one of this tenancy's tenants.
  if (!receipt.tenants.some((t) => String(t.email || "").trim().toLowerCase() === to)) {
    return NextResponse.json({ error: "That email isn't on file for this tenancy." }, { status: 400 });
  }

  const mail = mailer();
  const { error } = await mail.emails.send({ from: FROM, to: [to], replyTo: SITE.email, ...receiptEmail(receipt) });
  if (error) {
    console.error("[receipt-email] send failed:", error.name || "", error.message || "");
    return NextResponse.json({ error: "The email didn't send. Try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
