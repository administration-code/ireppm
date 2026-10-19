import { NextResponse } from "next/server";
import { insuranceReminders, leaseEndPrompts } from "@/lib/tenant-notices";
import { showingReminders } from "@/lib/showings";
import { drawDigest } from "@/lib/payprop-draw";
import { mailer, mailConfigured } from "@/lib/mailer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendMail, staffEmails } from "@/lib/application-review";
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
<h2 style="font-size:16px;margin-top:24px">Ready to Pay Landlords</h2>${readyHtml}
<h2 style="font-size:16px;margin-top:24px">Waiting on Rent</h2>${waitingHtml}
<h2 style="font-size:16px;margin-top:24px">Already Paid in Full</h2>
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
  const { error: sendError } = await mailer().emails.send({ from: FROM, to, subject, html, text });
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

  const digestFailed = await sendDigest(sb, today, result);
  result.reconciliation = await sendReconciliationAlert(sb, today);
  result.documentCleanup = await deleteExpiredDocuments(sb);
  result.screeningCleanup = await deleteExpiredScreeningReports(sb);
  result.creditReminders = await remindOverdueCreditChecks(sb);
  for (const [key, job] of [
    ["insurance", insuranceReminders],
    ["leaseEnd", leaseEndPrompts],
    ["showings", showingReminders],
    ["drawDigest", (db) => drawDigest(db, new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }))],
  ]) {
    try {
      result[key] = await job(sb);
    } catch (err) {
      console.error(`[cron] ${key} failed:`, err?.message || err);
      result[key] = { error: err?.message || "failed" };
    }
  }

  if (digestFailed) {
    return NextResponse.json({ ...result, error: "The rent digest didn't send" }, { status: 500 });
  }
  return NextResponse.json(result);
}

async function sendDigest(sb, today, result) {
  if (Number(today.slice(8, 10)) !== 8) {
    result.digest = "skipped (not the 8th)";
    return false;
  }

  const to = staffRecipients();
  if (!to.length) {
    result.digest = "skipped (STAFF_ALERT_EMAIL is not set)";
    return false;
  }

  try {
    const { email, counts } = await buildDigest(sb, `${today.slice(0, 7)}-01`);
    const { error: sendError } = await mailer().emails.send({ from: FROM, to, ...email });
    if (sendError) throw new Error(sendError.message);
    result.digest = { sent: true, to: to.length, ...counts };
    return false;
  } catch (err) {
    console.error("[cron] digest failed:", err.message);
    result.digest = "failed";
    return true;
  }
}

const ACCOUNTING_URL = "https://ireppm.ca/admin/accounting";

// One reconciliation email a day at most: last month's problems from the 5th, plus this month's
// errors on Mondays. Both land in the same email when they fall on the same day.
async function sendReconciliationAlert(sb, today) {
  const day = Number(today.slice(8, 10));
  const isMonday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
  if (day < 5 && !isMonday) return "skipped (nothing due today)";

  const { data, error } = await sb.rpc("reconciliation_alerts");
  if (error) {
    console.error("[cron] reconciliation_alerts failed:", error.message);
    return "failed";
  }

  const thisPeriod = `${today.slice(0, 7)}-01`;
  const rows = data || [];
  const lastRows = rows.filter((r) => String(r.period).slice(0, 10) < thisPeriod);
  const thisRows = rows.filter((r) => String(r.period).slice(0, 10) === thisPeriod);

  const sections = [];
  let subject = "";

  if (day >= 5 && lastRows.length) {
    const month = String(lastRows[0].period).slice(0, 7);
    const label = monthLabel(`${month}-01`);
    const withIssues = lastRows.filter((r) => (r.issues || []).length);
    const reminder = day >= 15;
    if (withIssues.length || reminder) {
      subject = `Reconciliation: ${label} needs attention`;
      sections.push({
        heading: label,
        url: `${ACCOUNTING_URL}?month=${month}`,
        note: reminder ? "Last month isn't locked yet." : "",
        accounts: withIssues.map((r) => ({ name: r.account, issues: r.issues })),
      });
    }
  }

  if (isMonday) {
    const withErrors = thisRows
      .map((r) => ({ name: r.account, issues: (r.issues || []).filter((i) => i.severity === "error") }))
      .filter((r) => r.issues.length);
    if (withErrors.length) {
      const label = monthLabel(thisPeriod);
      subject ||= `Reconciliation: ${label} this week`;
      sections.push({ heading: `${label} so far`, url: `${ACCOUNTING_URL}?month=${today.slice(0, 7)}`, note: "", accounts: withErrors });
    }
  }

  if (!sections.length) return "skipped (nothing to report)";
  const to = staffRecipients();
  if (!to.length) return "skipped (STAFF_ALERT_EMAIL is not set)";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:640px">
<h1 style="font-size:20px">${escapeHtml(subject)}</h1>
${sections
  .map(
    (s) => `<h2 style="font-size:16px;margin-top:24px">${escapeHtml(s.heading)}</h2>
${s.note ? `<p><b>${escapeHtml(s.note)}</b></p>` : ""}
${s.accounts
  .map(
    (a) => `<p style="margin:12px 0 4px;font-weight:bold">${escapeHtml(a.name)}</p><ul style="margin:0;padding-left:20px">${a.issues
      .map((i) => `<li style="margin-bottom:6px">${escapeHtml(i.title)}${i.fix ? `<br><span style="color:#555">${escapeHtml(i.fix)}</span>` : ""}</li>`)
      .join("")}</ul>`
  )
  .join("")}
<p style="margin-top:16px"><a href="${escapeHtml(s.url)}" style="background:#B41710;color:#fff;padding:10px 16px;text-decoration:none;font-weight:bold">Open reconciliation</a></p>`
  )
  .join("")}
</div>`;
  const text = [
    subject,
    ...sections.flatMap((s) => [
      "",
      s.heading,
      ...(s.note ? [s.note] : []),
      ...s.accounts.flatMap((a) => [`${a.name}:`, ...a.issues.map((i) => `- ${i.title}${i.fix ? ` (${i.fix})` : ""}`)]),
      s.url,
    ]),
  ].join("\n");

  const { error: sendError } = await mailer().emails.send({ from: FROM, to, subject, html, text });
  if (sendError) {
    console.error("[cron] reconciliation email failed:", sendError.message);
    return "failed";
  }
  return { sent: true, sections: sections.length };
}

// FrontLobby checks started 2+ days ago with no report uploaded: remind staff once.
async function remindOverdueCreditChecks(sb) {
  const { data, error } = await sb.rpc("credit_checks_overdue", { p_days: 2 });
  if (error) {
    console.error("[cron] credit_checks_overdue failed:", error.message);
    return { error: "Couldn't load overdue credit checks" };
  }
  if (!data?.length) return { reminded: 0 };
  const lines = data.map((r) => `${r.applicant_name} for ${r.place} (started ${new Date(r.started_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "America/Toronto" })})`);
  const res = await sendMail({
    to: staffEmails(),
    subject: `Credit check${data.length > 1 ? "s" : ""} waiting for a report (${data.length})`,
    lines: [
      "These FrontLobby checks were started more than 2 days ago, but no report has been uploaded:",
      lines.join("\n"),
      "If the applicant hasn't completed FrontLobby's request, follow up with them. Otherwise download the report from FrontLobby and upload it to the application.",
    ],
    link: "https://ireppm.ca/admin/requests?tab=applications",
    linkLabel: "Open applications",
  });
  if (res?.sent || res?.skipped) {
    await sb.from("applications").update({ credit_reminder_sent_at: new Date().toISOString() }).in("id", data.map((r) => r.application_id));
  }
  return { reminded: data.length };
}

// Credit reports follow the same retention as applicant documents. Only counts are logged.
async function deleteExpiredScreeningReports(sb) {
  const summary = { files: 0, skipped: 0 };
  const { data, error } = await sb.rpc("screening_reports_due_for_deletion", { p_days: 80 });
  if (error) {
    console.error("[cron] screening_reports_due_for_deletion failed:", error.message);
    return { ...summary, error: "Couldn't load screening reports due for deletion" };
  }
  for (const row of data || []) {
    // screening_reports_due_for_deletion returns (application_id, file_path).
    const appId = row.application_id;
    const path = row.file_path;
    if (!appId || !path) continue;
    const { error: removeError } = await sb.storage.from("screening-reports").remove([path]);
    if (removeError) {
      console.error("[cron] removing a screening report failed; will retry tomorrow:", removeError.message);
      summary.skipped += 1;
      continue;
    }
    const { error: clearError } = await sb.from("applications").update({ credit_report_path: null }).eq("id", appId);
    if (clearError) {
      console.error("[cron] clearing credit_report_path failed:", clearError.message);
      summary.skipped += 1;
      continue;
    }
    summary.files += 1;
  }
  return summary;
}

// Privacy policy: unsuccessful applicants' documents are deleted within 90 days of the decision.
// Only counts are logged here, never file names or applicant names.
async function deleteExpiredDocuments(sb) {
  const summary = { users: 0, files: 0, skipped: 0 };
  const { data, error } = await sb.rpc("documents_due_for_deletion", { p_days: 80 });
  if (error) {
    console.error("[cron] documents_due_for_deletion failed:", error.message);
    return { ...summary, error: "Couldn't load documents due for deletion" };
  }

  const pathsByUser = new Map();
  for (const row of data || []) {
    if (!row.user_id || !row.file_path) continue;
    if (!pathsByUser.has(row.user_id)) pathsByUser.set(row.user_id, []);
    pathsByUser.get(row.user_id).push(row.file_path);
  }

  for (const [userId, paths] of pathsByUser) {
    const { error: removeError } = await sb.storage.from("applicant-docs").remove(paths);
    if (removeError) {
      console.error(`[cron] removing ${paths.length} applicant file(s) failed; will retry tomorrow:`, removeError.message);
      summary.skipped += 1;
      continue;
    }
    const { error: finishError } = await sb.rpc("finish_document_deletion", { p_user_id: userId, p_paths: paths });
    if (finishError) {
      console.error(`[cron] finish_document_deletion failed after removing ${paths.length} file(s):`, finishError.message);
      summary.skipped += 1;
      continue;
    }
    summary.users += 1;
    summary.files += paths.length;
  }

  return summary;
}
