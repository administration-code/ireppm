import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { mailer, mailConfigured } from "@/lib/mailer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { escapeHtml } from "@/lib/staff-alerts";
import { money } from "@/lib/format";
import { OLD_ADDRESS, isOldAddress, urgentOldAddress } from "@/lib/etransfer-reminders";

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
      <h1 style="font-family:Georgia,serif;font-weight:600;font-size:24px;margin:0 0 8px;">${payment.oldAddress ? "Paid to Old Address" : "e-Transfer to Match"}</h1>
      <p style="margin:0 0 16px;">${
        payment.oldAddress
          ? `This e-Transfer was sent to ${escapeHtml(OLD_ADDRESS)}. We couldn't match it to a tenant with an email on file, so no URGENT email went out. Match it, then email the tenant.`
          : "We couldn't tell which tenancy this e-Transfer is for. Match it in the staff area."
      }</p>
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
    subject: `${payment.oldAddress ? "Paid to old address" : "e-Transfer to match"}: ${money(payment.amount)} from ${payer}`,
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

  const sb0 = getSupabaseAdmin();
  const feed = await noteFeed(sb0, body);

  // Connection test / heartbeat from the Apps Script: the secret matched.
  if (body?.ping) return NextResponse.json({ ok: true, ping: true, role: feed.role, retired: feed.retired });

  const amount = Math.round(Number(body?.amount) * 100) / 100;
  const reference = clip(body?.reference, 100);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  const receivedOn = torontoDate(body.received_at);
  const sb = sb0;

  // Test e-Transfer ("IREP TEST" in the message): log which mailbox got it, don't record it as rent.
  if (/irep\s*test/i.test(String(body.message || ""))) {
    if (feed.mailbox)
      await sb
        .from("mail_feed_status")
        .update({ last_test_at: new Date(body.received_at || Date.now()).toISOString(), last_test_amount: amount, last_test_from: clip(body.sent_from, 200) })
        .eq("mailbox", feed.mailbox);
    return NextResponse.json({ ok: true, test: true, recorded: true });
  }

  // Seen already (the same notice can reach both mailboxes while they run side by side).
  const [{ data: seenPay }, { data: seenPend }] = await Promise.all([
    sb.from("payments").select("id, status").eq("reference", reference).limit(1),
    sb.from("etransfer_pending").select("id").eq("reference", reference).limit(1),
  ]);
  if (seenPay?.length) return NextResponse.json({ ok: true, duplicate: true, recorded: true, matched: seenPay[0].status === "matched" });
  if (seenPend?.length && body.pending) return NextResponse.json({ ok: true, duplicate: true, pending: true });
  // The address the e-Transfer was sent to. Interac's deposit notices don't say, but since Nov 25 2026
  // every notice for payment@ireppm.ca goes to the payment@ mailbox, so anything the old mailbox
  // passes on was sent to the old address.
  const sentTo = clip(body.sent_to, 200) || (feed.role === "legacy" ? OLD_ADDRESS : null);
  const oldAddress = isOldAddress(sentTo);

  // Sent to the old address and not deposited automatically: staff must accept it in online banking.
  // Record it for staff (not as a payment yet) and remind the tenant to use payment@ireppm.ca.
  if (body.pending) {
    const { data: guess } = await sb.rpc("match_payer", { p_name: clip(body.sent_from, 200) || "" }).maybeSingle();
    const tenancyId = guess?.match_id || null;
    const { data: row, error: pendErr } = await sb
      .from("etransfer_pending")
      .insert({
        reference,
        amount,
        payer_name: clip(body.sent_from, 200),
        memo: clip(body.message, 1000),
        sent_to: sentTo,
        received_at: new Date(body.received_at || Date.now()).toISOString(),
        tenancy_id: tenancyId,
      })
      .select("id")
      .single();
    if (pendErr?.code === "23505") return NextResponse.json({ ok: true, duplicate: true, pending: true });
    if (pendErr) {
      console.error("[interac] pending insert failed:", pendErr.message);
      return NextResponse.json({ error: "Could not save" }, { status: 500 });
    }
    // Matched: URGENT email to the tenant right away (administration@ copied). Not matched (or no
    // tenant email): it waits in To Match and staff are alerted instead.
    const urgent = tenancyId
      ? await urgentOldAddress(sb, { tenancyId, amount, receivedOn, pending: true, reference }).catch(() => ({ sent: false }))
      : { sent: false };
    if (!urgent.sent)
      await alertPending({ amount, payer_name: clip(body.sent_from, 200), memo: clip(body.message, 1000), reference, received_on: receivedOn, sent_to: sentTo }).catch(
        (err) => console.error("[interac] pending alert failed:", err?.message || err)
      );
    return NextResponse.json({ ok: true, pending: true, id: row.id, urgent: urgent.sent });
  }

  // Staff may already have recorded this e-Transfer by hand (no reference number).
  // If a hand-entered e-Transfer has the same amount within two days, attach the
  // reference to it instead of adding a second payment.
  const day = 24 * 60 * 60 * 1000;
  const from = new Date(Date.parse(receivedOn) - 2 * day).toISOString().slice(0, 10);
  const to = new Date(Date.parse(receivedOn) + 2 * day).toISOString().slice(0, 10);
  const { data: manual } = await sb
    .from("payments")
    .select("id, memo")
    .eq("method", "etransfer")
    .eq("amount", amount)
    .is("reference", null)
    .gte("received_on", from)
    .lte("received_on", to)
    .order("received_on")
    .limit(1);
  if (manual?.length) {
    const { error: linkErr } = await sb.from("payments").update({ reference }).eq("id", manual[0].id);
    if (!linkErr || linkErr.code === "23505") return NextResponse.json({ ok: true, duplicate: true, recorded: true, linked: manual[0].id });
    console.error("[interac] linking to hand-entered payment failed:", linkErr.message);
  }
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
      sent_to: sentTo,
    })
    .select("id, status, tenancy_id, amount, payer_name, memo, reference, received_on")
    .single();

  if (error?.code === "23505") return NextResponse.json({ ok: true, duplicate: true, recorded: true });
  if (error) {
    console.error("[interac] insert failed:", error.message);
    return NextResponse.json({ error: "Could not save payment" }, { status: 500 });
  }

  const { error: rpcError } = await sb.rpc("generate_rent_charges", { p_month: receivedOn });
  if (rpcError) console.error("[interac] generate_rent_charges failed:", rpcError.message);

  const matched = payment.status === "matched";
  const urgent =
    matched && oldAddress && payment.tenancy_id
      ? await urgentOldAddress(sb, { tenancyId: payment.tenancy_id, amount, receivedOn, pending: false, reference }).catch(() => ({ sent: false }))
      : { sent: false };
  if (!matched || (oldAddress && !urgent.sent)) {
    try {
      await alertStaff({ ...payment, oldAddress });
    } catch (err) {
      console.error("[interac] alert email failed:", err?.message || err);
    }
  }
  return NextResponse.json({ ok: true, recorded: true, matched, urgent: urgent.sent });
}

// The old ireppm@ireprealty.com mailbox keeps being read: anything that arrives there was sent to
// the old address, and the tenant gets the URGENT email.
const LEGACY = /ireprealty\.com/i;

// Records which mailbox the reader is running in (shown under Settings → e-Transfer Reader).
async function noteFeed(sb, body) {
  const mailbox = clip(String(body?.mailbox || "").toLowerCase(), 200);
  const role = mailbox && LEGACY.test(mailbox) ? "legacy" : "primary";
  const retired = false;
  if (!mailbox) return { mailbox: null, role, retired };
  const now = new Date().toISOString();
  const { data: cur } = await sb.from("mail_feed_status").select("items_total").eq("mailbox", mailbox).maybeSingle();
  const item = !body?.ping;
  await sb.from("mail_feed_status").upsert({
    mailbox,
    feed: "interac",
    role,
    version: clip(body?.version, 40),
    last_seen_at: now,
    ...(item ? { last_item_at: now, items_total: (cur?.items_total || 0) + 1 } : {}),
    updated_at: now,
  });
  return { mailbox, role, retired };
}

async function alertPending(p) {
  const to = staffRecipients();
  if (!to.length || !mailConfigured()) return;
  const rows = [
    ["Amount", money(p.amount)],
    ["From", p.payer_name || "Unknown sender"],
    ["Sent to", p.sent_to || "the old address"],
    ["Received", p.received_on],
    ["Message", p.memo || "—"],
    ["Reference", p.reference],
  ];
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#161616;background:#F7F4EE;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #ddd5c9;border-radius:4px;padding:24px;">
      <h1 style="font-family:Georgia,serif;font-weight:600;font-size:24px;margin:0 0 8px;">e-Transfer Waiting to Be Accepted</h1>
      <p style="margin:0 0 16px;">This e-Transfer went to the old address (${escapeHtml(OLD_ADDRESS)}), so it wasn't deposited automatically. We couldn't match it to a tenant with an email on file, so no URGENT email went out. Match it on the To Match page and contact the tenant to cancel and resend it to payment@ireppm.ca.</p>
      <table style="border-collapse:collapse;font-size:14px;">${rows
        .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#5e5852;">${escapeHtml(k)}</td><td style="padding:4px 0;">${escapeHtml(v)}</td></tr>`)
        .join("")}</table>
      <p style="margin:20px 0 0;"><a href="${MATCH_URL}" style="display:inline-block;background:#B41710;color:#fff;text-decoration:none;padding:10px 18px;border-radius:4px;font-weight:600;">Open To Match</a></p>
    </div></div>`;
  const { error } = await mailer().emails.send({
    from: FROM,
    to,
    subject: `Pending e-Transfer (old address): ${money(p.amount)} from ${p.payer_name || "unknown sender"}`,
    html,
    text: [...rows.map(([k, v]) => `${k}: ${v}`), "", `Open To Match: ${MATCH_URL}`].join("\n"),
  });
  if (error) console.error("[interac] pending alert failed:", error.message || "");
}
