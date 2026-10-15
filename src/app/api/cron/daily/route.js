import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { escapeHtml } from "@/lib/staff-alerts";
import { money } from "@/lib/format";
import { cents, monthLabel, primaryTenant, todayISO } from "@/lib/rent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM = "IRep Property Management <alerts@ireppm.ca>";
const PAYOUTS_URL = "https://ireppm.ca/admin/payouts";
const LETTERS_URL = "https://ireppm.ca/admin/letters";

function staffRecipients() {
  return (process.env.STAFF_ALERT_EMAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function table(headers, rows) {
  const th = headers
    .map((h, i) => `<th align="${i ? "right" : "left"}" style="padding:6px 8px;border-bottom:1px solid #ddd">${escapeHtml(h)}</th>`)
    .join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => `<td align="${i ? "right" : "left"}" style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top">${c}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

async function buildDigest(sb, period) {
  const [totals, properties, collection] = await Promise.all([
    sb.from("owner_statement_totals").select("*").eq("period", period),
    sb.from("properties").select("id, address, owner:owners(name)"),
    sb.from("rent_collection").select("tenancy_id, property_id, outstanding").eq("period", period).gt("outstanding", 0),
  ]);
  if (totals.error || properties.error || collection.error) throw new Error("Couldn't load statement totals");

  const props = new Map((properties.data || []).map((p) => [p.id, p]));
  const owing = collection.data || [];
  const tenancyIds = [...new Set(owing.map((r) => r.tenancy_id))];
  const tenants = tenancyIds.length
    ? await sb.from("tenancy_tenants").select("tenancy_id, full_name, is_primary, created_at").in("tenancy_id", tenancyIds)
    : { data: [] };
  const byTenancy = {};
  for (const t of tenants.data || []) (byTenancy[t.tenancy_id] ||= []).push(t);

  const rows = (totals.data || []).sort((a, b) =>
    String(props.get(a.property_id)?.address).localeCompare(String(props.get(b.property_id)?.address))
  );
  const ready = rows.filter((r) => r.full_by_7th && cents(r.to_pay) > 0);
  const waiting = rows.filter((r) => cents(r.rent_outstanding) > 0);
  const paidInFull = rows.filter((r) => r.full_by_7th && cents(r.to_pay) <= 0).length;

  const label = monthLabel(period);
  const address = (id) => escapeHtml(props.get(id)?.address || "Unknown property");
  const readyTotal = ready.reduce((s, r) => s + cents(r.to_pay), 0) / 100;

  const readyHtml = ready.length
    ? table(
        ["Property", "Owner", "To pay"],
        [
          ...ready.map((r) => [address(r.property_id), escapeHtml(props.get(r.property_id)?.owner?.name || "—"), escapeHtml(money(r.to_pay))]),
          ["<b>Total</b>", "", `<b>${escapeHtml(money(readyTotal))}</b>`],
        ]
      )
    : "<p>No properties are ready to pay yet.</p>";

  const waitingHtml = waiting.length
    ? table(
        ["Property", "Outstanding"],
        waiting.map((r) => {
          const who = owing
            .filter((o) => o.property_id === r.property_id)
            .map((o) => `${escapeHtml(primaryTenant({ tenancy_tenants: byTenancy[o.tenancy_id] }))} (${escapeHtml(money(o.outstanding))})`)
            .join("<br>");
          return [`${address(r.property_id)}${who ? `<br><span style="color:#666">${who}</span>` : ""}`, escapeHtml(money(r.rent_outstanding))];
        })
      )
    : "<p>Nobody is behind on rent.</p>";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:640px">
<h1 style="font-size:20px">Rent through the 7th: ${escapeHtml(label)}</h1>
<h2 style="font-size:16px;margin-top:24px">Ready to pay landlords</h2>${readyHtml}
<h2 style="font-size:16px;margin-top:24px">Waiting on rent</h2>${waitingHtml}
<h2 style="font-size:16px;margin-top:24px">Already paid in full</h2>
<p>${paidInFull} ${paidInFull === 1 ? "property" : "properties"}</p>
<p style="margin-top:24px"><a href="${PAYOUTS_URL}" style="background:#c8102e;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold">Open landlord payouts</a></p>
</div>`;

  const text = [
    `Rent through the 7th: ${label}`,
    "",
    "Ready to pay landlords:",
    ...(ready.length
      ? ready.map((r) => `- ${props.get(r.property_id)?.address}: ${money(r.to_pay)}`).concat(`Total: ${money(readyTotal)}`)
      : ["- None yet"]),
    "",
    "Waiting on rent:",
    ...(waiting.length ? waiting.map((r) => `- ${props.get(r.property_id)?.address}: ${money(r.rent_outstanding)}`) : ["- None"]),
    "",
    `Already paid in full: ${paidInFull}`,
    "",
    PAYOUTS_URL,
  ].join("\n");

  return {
    email: { subject: `Rent through the 7th: ${label}`, html, text },
    counts: { ready: ready.length, waiting: waiting.length, paidInFull },
  };
}

// On the 1st: draft every owner's letter for last month and tell staff they're ready to review.
async function draftLastMonthsLetters(sb, today) {
  const [y, m] = today.split("-").map(Number);
  const month = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const { data: count, error } = await sb.rpc("draft_owner_letters", { p_period: `${month}-01` });
  if (error) {
    console.error("[cron] draft_owner_letters failed:", error.message);
    return "failed";
  }

  const to = staffRecipients();
  if (!to.length) return { drafted: count, email: "skipped (STAFF_ALERT_EMAIL is not set)" };

  const label = monthLabel(`${month}-01`);
  const url = `${LETTERS_URL}?month=${month}`;
  const subject = `Landlord letters for ${label} are ready to review`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:640px">
<h1 style="font-size:20px">${escapeHtml(subject)}</h1>
<p>${escapeHtml(String(count ?? 0))} draft ${count === 1 ? "letter is" : "letters are"} ready. Check them over, add any notes, then send.</p>
<p style="margin-top:24px"><a href="${escapeHtml(url)}" style="background:#B41710;color:#fff;padding:10px 16px;text-decoration:none;font-weight:bold">Review landlord letters</a></p>
</div>`;
  const text = `${subject}\n\n${count ?? 0} draft letters are ready.\n\n${url}`;
  const { error: sendError } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: FROM, to, subject, html, text });
  if (sendError) {
    console.error("[cron] letters email failed:", sendError.message);
    return { drafted: count, email: "failed" };
  }
  return { drafted: count, email: "sent" };
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const today = todayISO();
  const result = { date: today, charges: null, digest: null };

  const { data, error } = await sb.rpc("generate_rent_charges", { p_month: today });
  if (error) {
    console.error("[cron] generate_rent_charges failed:", error.message);
    return NextResponse.json({ ...result, error: "Generating rent charges failed" }, { status: 500 });
  }
  result.charges = data ?? "ok";

  if (Number(today.slice(8, 10)) === 1) {
    result.letters = await draftLastMonthsLetters(sb, today);
  }

  if (Number(today.slice(8, 10)) !== 8) {
    result.digest = "skipped (not the 8th)";
    return NextResponse.json(result);
  }

  const to = staffRecipients();
  if (!to.length) return NextResponse.json({ ...result, digest: "skipped (STAFF_ALERT_EMAIL is not set)" });

  try {
    const { email, counts } = await buildDigest(sb, `${today.slice(0, 7)}-01`);
    const { error: sendError } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: FROM, to, ...email });
    if (sendError) throw new Error(sendError.message);
    result.digest = { sent: true, to: to.length, ...counts };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron] digest failed:", err.message);
    return NextResponse.json({ ...result, digest: "failed", error: "The rent digest didn't send" }, { status: 500 });
  }
}
