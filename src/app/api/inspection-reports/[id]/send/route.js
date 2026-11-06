import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { loadReport, ownerReportUrl, yesNo, GUTTER } from "@/lib/inspection-reports";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText, escapeHtml } from "@/lib/staff-alerts";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Staff: email the landlord the report's recommended improvements to approve or decline.
export async function POST(request, { params }) {
  const { id } = await params;
  if (!UUID.test(String(id))) return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  const sb = getSupabaseAdmin();
  if (!(await staffFromRequest(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  if (!mailConfigured()) return NextResponse.json({ error: "Email isn't set up yet." }, { status: 500 });
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const r = await loadReport(sb, id);
  if (!r) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const owner = r.property?.owner;
  const to = String(owner?.email || "").trim();
  if (!to) return NextResponse.json({ error: "This landlord has no email on file." }, { status: 400 });
  const pending = r.items.filter((i) => i.decision === "pending");
  const hasItems = r.items.length > 0;

  const name = owner.name || "there";
  const message = String(body?.message || "").trim().slice(0, 2000);
  const intro = hasItems
    ? `Hi ${name}, ${
        message || `we inspected ${r.property.address} on ${r.inspected_on}. Below are our recommended improvements.`
      } Please approve or decline each one in your landlord portal. We'll send you a price for each item you approve before any work starts.`
    : `Hi ${name}, ${
        message || `we inspected ${r.property.address} on ${r.inspected_on}. We have no improvements to recommend at this time.`
      } The full report is in your landlord portal, where you can also download it as a PDF.`;
  const rows = [
    ["Property", [r.property.address, r.property.city].filter(Boolean).join(", ")],
    ["Inspected", r.inspected_on],
    ["Furnace filter swapped", yesNo(r.furnace_filter_swapped)],
    ["Water shut-off valve set for the season", yesNo(r.water_valve_set)],
    ["Gutters", GUTTER[r.gutter_condition] || "Not checked"],
    ["Signs of pests", r.pests ? `Yes${r.pests_note ? `: ${r.pests_note}` : ""}` : yesNo(r.pests)],
  ];
  const list = r.items
    .map((i) => `<li style="margin:0 0 6px;"><b>${escapeHtml(i.description)}</b>${i.unit?.label && i.unit.label !== "Whole property" ? ` (${escapeHtml(i.unit.label)})` : ""}${i.details ? `<br><span style="color:#555;">${escapeHtml(i.details)}</span>` : ""}</li>`)
    .join("");
  const extraHtml = !hasItems ? "" : `<h2 style="margin:20px 0 8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;">Recommended improvements</h2><ol style="margin:0;padding-left:20px;font-size:15px;line-height:1.5;">${list}</ol>`;
  const link = { href: ownerReportUrl(id), label: hasItems ? "Approve or decline each item" : "View the inspection report" };
  const heading = hasItems ? "Inspection report and recommended improvements" : "Inspection report";
  const { error } = await mailer().emails.send({
    from: "IRep Property Management <statements@ireppm.ca>",
    to: [to],
    cc: body?.cc_office ? [SITE.email] : undefined,
    replyTo: SITE.email,
    subject: hasItems ? `Recommended improvements: ${r.property.address}` : `Inspection report: ${r.property.address}`,
    html: renderEmail({ heading, intro, rows, extraHtml, link }),
    text: renderText({
      heading,
      rows,
      link,
      extra: !hasItems ? intro : `${intro}\n\nRecommended improvements:\n${r.items.map((i, n) => `${n + 1}. ${i.description}${i.details ? `: ${i.details}` : ""}`).join("\n")}`,
    }),
  });
  if (error) return NextResponse.json({ error: "The email didn't send. Try again." }, { status: 502 });

  await sb.from("inspection_reports").update({ status: "sent", sent_at: new Date().toISOString(), sent_to: to }).eq("id", id);
  return NextResponse.json({ sent: true, to, pending: pending.length });
}
