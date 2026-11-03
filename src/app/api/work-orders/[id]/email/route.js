import { NextResponse } from "next/server";
import { mailer, mailConfigured } from "@/lib/mailer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { workOrderInvoiceEmail } from "@/lib/invoice-email";
import { SITE } from "@/lib/site";
import { mfaSatisfied } from "@/lib/staff-mfa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM = "IRep Property Management <statements@ireppm.ca>";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function staffUser(sb, request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user || !mfaSatisfied(data.user, token)) return null;
  const { data: profile } = await sb.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return profile && ["staff", "admin"].includes(profile.role) ? data.user : null;
}

// Staff: email a work order's itemized invoice to the property's owner.
export async function POST(request, { params }) {
  const { id } = await params;
  if (!UUID.test(String(id))) return NextResponse.json({ error: "Invalid work order." }, { status: 400 });
  const sb = getSupabaseAdmin();
  if (!(await staffUser(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  if (!mailConfigured()) return NextResponse.json({ error: "Email isn't set up yet." }, { status: 500 });

  let body = {};
  try {
    body = await request.json();
  } catch {}
  const message = typeof body?.message === "string" ? body.message.slice(0, 2000) : "";

  const { data: inv, error } = await sb.rpc("work_order_invoice", { p_request_id: id });
  if (error || !inv) return NextResponse.json({ error: "We couldn't load that invoice." }, { status: 404 });
  if (!Array.isArray(inv.lines) || !inv.lines.length) {
    return NextResponse.json({ error: "Add the invoice lines and save the invoice before emailing it." }, { status: 400 });
  }

  const { data: wo } = await sb
    .from("maintenance_requests")
    .select("id, staff_notes, unit:units(property:properties(owner:owners(name, email)))")
    .eq("id", id)
    .maybeSingle();
  const owner = wo?.unit?.property?.owner;
  const to = String(owner?.email || "").trim();
  if (!to) return NextResponse.json({ error: "This landlord has no email on file." }, { status: 400 });

  const { error: sendError } = await mailer().emails.send({
    from: FROM,
    to: [to],
    cc: body?.cc_office ? [SITE.email] : undefined,
    replyTo: SITE.email,
    ...workOrderInvoiceEmail(inv, owner?.name, to, message),
  });
  if (sendError) {
    console.error("[work-orders/email] send failed:", sendError.name || "", sendError.message || "");
    return NextResponse.json({ error: "The email didn't send. Try again." }, { status: 502 });
  }

  const when = new Date().toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" });
  const stamp = `Invoice emailed to ${to} on ${when}.`;
  await sb
    .from("maintenance_requests")
    .update({ staff_notes: [wo?.staff_notes, stamp].filter(Boolean).join("\n") })
    .eq("id", id);

  return NextResponse.json({ sent: true, to, stamp });
}
