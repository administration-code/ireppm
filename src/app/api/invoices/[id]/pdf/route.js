import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerIdsFromRequest, staffFromRequest } from "@/lib/server-auth";
import { invoiceFileName, invoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The invoice as a PDF, for staff (any invoice) or the landlord it bills (once sent).
// GET  with  Authorization: Bearer <session token>
export async function GET(request, { params }) {
  const { id } = await params;
  if (!UUID.test(String(id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const sb = getSupabaseAdmin();
  const { data: inv } = await sb.rpc("invoice_doc", { p_id: id });
  if (!inv) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const staff = await staffFromRequest(sb, request);
  if (!staff) {
    const mine = inv.owner_id && ["sent", "paid"].includes(inv.status) && (await ownerIdsFromRequest(sb, request)).includes(inv.owner_id);
    if (!mine) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const pdf = invoicePdf(inv);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceFileName(inv)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
