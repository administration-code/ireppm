import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { mailer, mailConfigured } from "@/lib/mailer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { escapeHtml } from "@/lib/staff-alerts";
import { money } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM = "IRep Property Management <alerts@ireppm.ca>";
const MATCH_URL = "https://ireppm.ca/admin/rent/match";

function secretMatches(provided) {
  const expected = process.env.PAYMENTS_WEBHOOK_SECRET;
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function staffRecipients() {
  return (process.env.STAFF_ALERT_EMAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function torontoDate(value) {
  const d = new Date(value || Date.now());
  const date = Number.isNaN(d.getTime()) ? new Date() : d;
  return date.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

const clip = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

async function alertStaff(payment) {
  const to = staffRecipients();
  if (!to.length || !mailConfigured()) {
    console.error("[interac] unmatched e-Transfer alert skipped: STAFF_ALERT_EMAIL or email sending is not set up");
    return;
  }
  const payer = payment.payer_name || "an unknown sender";
  const rows = [
    ["Amount", money(payment.amount)],
    ["From", payer],
    ["Received", payment.received_on],
    ["Message", payment.memo || "—"],
    ["Reference", payment.reference],
  ];
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#161616;background:#F7F4EE;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #ddd5c9;border-radius:4px;padding:24px;">
      <h1 style="font-family:Georgia,serif;font-weight:600;font-size:24px;margin:0 0 8px;">e-Transfer to Match</h1>
      <p style="margin:0 0 16px;">We couldn't tell which tenancy this e-Transfer is for. Match it in the staff area.</p>
      <table style="border-collapse:collapse;font-size:14px;">${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 16px 4px 0;color:#5e5852;">${escapeHtml(k)}</td><td style="padding:4px 0;">${escapeHtml(v)}</td></tr>`
        )
        .join("")}</table>
      <p style="margin:20px 0 0;"><a href="${MATCH_URL}" style="display:inline-block;background:#B41710;color:#fff;text-decoration:none;padding:10px 18px;border-radius:4px;font-weight:600;">Match this payment</a></p>
    </div></div>`;
  const text = [...rows.map(([k, v]) => `${k}: ${v}`), "", `Match it: ${MATCH_URL}`].join("\n");

  const mail = mailer();
  const { error } = await mail.emails.send({
    from: FROM,
    to,
    subject: `e-Transfer to match: ${money(payment.amount)} from ${payer}`,
    html,
    text,
  });
  if (error) console.error("[interac] alert email failed:", error.name || "", error.message || "");
}

export async function POST(request) {
  if (!secretMatches(request.headers.get("x-payments-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = Math.round(Number(body?.amount) * 100) / 100;
  const reference = clip(body?.reference, 100);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  const receivedOn = torontoDate(body.received_at);
  const sb = getSupabaseAdmin();
  const { data: payment, error } = await sb
    .from("payments")
    .insert({
      received_on: receivedOn,
      amount,
      method: "etransfer",
      kind: "rent",
      payer_name: clip(body.sent_from, 200),
      memo: clip(body.message, 1000),
      reference,
      source: "interac_email",
    })
    .select("id, status, amount, payer_name, memo, reference, received_on")
    .single();

  if (error?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  if (error) {
    console.error("[interac] insert failed:", error.message);
    return NextResponse.json({ error: "Could not save payment" }, { status: 500 });
  }

  const { error: rpcError } = await sb.rpc("generate_rent_charges", { p_month: receivedOn });
  if (rpcError) console.error("[interac] generate_rent_charges failed:", rpcError.message);

  const matched = payment.status === "matched";
  if (!matched) {
    try {
      await alertStaff(payment);
    } catch (err) {
      console.error("[interac] alert email failed:", err?.message || err);
    }
  }

  return NextResponse.json({ ok: true, matched });
}
