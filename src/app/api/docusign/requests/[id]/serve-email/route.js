import { NextResponse } from "next/server";
import { mailer, mailConfigured } from "@/lib/mailer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { SIGNED_BUCKET, staffUser } from "@/lib/signatures-server";
import { escapeHtml } from "@/lib/staff-alerts";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM = "IRep Property Management <notices@ireppm.ca>";
const FORM_NAME = { N1: "N1 Notice of Rent Increase" };

export async function POST(request, { params }) {
  const { id } = await params;
  const sb = getSupabaseAdmin();
  const staff = await staffUser(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  if (!mailConfigured()) return NextResponse.json({ error: "Email isn't set up." }, { status: 500 });

  const { data: row } = await sb.from("signature_requests").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (row.kind !== "N1") {
    return NextResponse.json({ error: "Serve N4/N5 by hand, mail slot or mail." }, { status: 400 });
  }
  if (row.status !== "completed" || !row.signed_file_path) return NextResponse.json({ error: "It isn't signed yet." }, { status: 400 });
  if (row.notice_id) return NextResponse.json({ error: "This notice has already been served." }, { status: 400 });

  const { data: tenancy } = await sb
    .from("tenancies")
    .select("id, email_service_ok, email_service_consent, unit:units(label, property:properties(address))")
    .eq("id", row.tenancy_id)
    .maybeSingle();
  if (!tenancy?.email_service_ok) {
    return NextResponse.json(
      { error: `No written consent to email service on file (${tenancy?.email_service_consent || "none recorded"}).` },
      { status: 400 }
    );
  }
  const { data: tenants } = await sb.from("tenancy_tenants").select("full_name, email").eq("tenancy_id", tenancy.id);
  const to = [...new Set((tenants || []).map((t) => (t.email || "").trim().toLowerCase()).filter(Boolean))];
  if (!to.length) return NextResponse.json({ error: "No tenant email addresses on file." }, { status: 400 });

  const { data: file, error: dlError } = await sb.storage.from(SIGNED_BUCKET).download(row.signed_file_path);
  if (dlError) return NextResponse.json({ error: `Couldn't load the signed PDF: ${dlError.message}` }, { status: 500 });
  const pdf = Buffer.from(await file.arrayBuffer());

  const place = [tenancy.unit?.property?.address, tenancy.unit?.label].filter(Boolean).join(", ");
  const subject = `${row.kind} notice for ${place}`;
  const names = (tenants || []).map((t) => t.full_name).filter(Boolean).join(", ");
  const lines = [
    `Dear ${names || "tenant"},`,
    `Attached is your ${FORM_NAME[row.kind] || row.kind} for ${place}. You agreed in writing to receive notices by email.`,
    `If you have questions, contact ${SITE.name} at ${SITE.phone} or ${SITE.email}.`,
    `${SITE.name}\n${SITE.phone}`,
  ];

  const { error: sendError } = await mailer().emails.send({
    from: FROM,
    to,
    replyTo: SITE.email,
    subject,
    text: lines.join("\n\n"),
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#161616">${lines
      .map((l) => `<p style="margin:0 0 12px">${escapeHtml(l).replace(/\n/g, "<br>")}</p>`)
      .join("")}</div>`,
    attachments: [{ filename: `${row.kind}-notice.pdf`, content: pdf.toString("base64") }],
  });
  if (sendError) return NextResponse.json({ error: `Email failed: ${sendError.message}` }, { status: 502 });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const { data: noticeId, error: rpcError } = await sb.rpc("record_notice_service", {
    p_request_id: id,
    p_served_on: today,
    p_method: "email",
    p_served_by: staff.full_name,
  });
  if (rpcError) return NextResponse.json({ error: `Emailed, but couldn't record service: ${rpcError.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, notice_id: noticeId, sent_to: to });
}
