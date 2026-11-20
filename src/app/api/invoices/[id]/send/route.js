import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { mailer, mailConfigured } from "@/lib/mailer";
import { invoiceFileName, invoicePdf } from "@/lib/invoice-pdf";
import { invoiceEmail } from "@/lib/invoice-mail";
import { invoiceNumber } from "@/lib/invoices";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM = "IRep Property Management <statements@ireppm.ca>";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Staff: email the invoice (PDF attached) to the client. A draft becomes "sent" and can no longer be edited.
// POST { message?, cc_office? }
export async function POST(request, { params }) {
  const { id } = await params;
  if (!UUID.test(String(id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const sb = getSupabaseAdmin();
  if (!(await staffFromRequest(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  if (!mailConfigured()) return NextResponse.json({ error: "Email isn't set up." }, { status: 500 });
  const body = await request.json().catch(() => ({}));

  const { data: inv } = await sb.rpc("invoice_doc", { p_id: id });
  if (!inv) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (inv.status === "void") return NextResponse.json({ error: "This invoice is void." }, { status: 400 });
  if (!inv.lines?.length) return NextResponse.json({ error: "Add at least one line before sending." }, { status: 400 });
  const to = String(inv.bill_to_email || "").trim();
  if (!EMAIL.test(to)) return NextResponse.json({ error: "Add the client's email under Bill To first." }, { status: 400 });

  let portal = false;
  if (inv.owner_id) {
    const { data: o } = await sb.from("owners").select("profile_id").eq("id", inv.owner_id).maybeSingle();
    portal = Boolean(o?.profile_id);
  }
  // The PDF shows it as sent (not a draft).
  const doc = inv.status === "draft" ? { ...inv, status: "sent" } : inv;
  const { error: sendError } = await mailer().emails.send({
    from: FROM,
    to: [to],
    cc: body?.cc_office ? [SITE.email] : undefined,
    replyTo: SITE.email,
    ...invoiceEmail(doc, { message: typeof body?.message === "string" ? body.message.slice(0, 2000) : "", portal }),
    attachments: [{ filename: invoiceFileName(doc), content: invoicePdf(doc) }],
  });
  if (sendError) {
    console.error("[invoices/send] failed:", sendError.message || sendError);
    return NextResponse.json({ error: "The email didn't send. Nothing was changed." }, { status: 502 });
  }

  const when = new Date().toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" });
  const stamp = `${invoiceNumber(inv.invoice_no)} emailed to ${to} on ${when}.`;
  const { error } = await sb
    .from("invoices")
    .update({
      ...(inv.status === "draft" ? { status: "sent" } : {}),
      sent_at: new Date().toISOString(),
      sent_to: to,
      staff_note: [inv.staff_note, stamp].filter(Boolean).join("\n"),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: `Sent, but the invoice didn't update: ${error.message}` }, { status: 500 });
  return NextResponse.json({ sent: true, to, stamp });
}
