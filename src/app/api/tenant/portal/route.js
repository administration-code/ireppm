import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { userFromRequest } from "@/lib/server-auth";
import { receiptParams } from "@/lib/receipt";
import { confirmFix, documentUrl, myReceipt, portalData, updateDetails } from "@/lib/tenant-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tenant portal: payments, visits, documents, contact details and "Is it fixed?" for the signed-in tenant.
//   GET                       → everything for My Home
//   GET ?receipt=1&payment=…  → one receipt (or &tenancy=…&from=…&to=…)
//   GET ?doc=lease:<id>       → a 10-minute link to one of the tenant's documents
//   POST { action: "confirm", id, answer: "fixed"|"not_fixed", note? }
//   POST { action: "details", people: [{ id, phone, email?, contact_time? }] }
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const who = await userFromRequest(sb, request);
  if (!who) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get("doc")) {
    const link = await documentUrl(sb, who.user.id, url.searchParams.get("doc"));
    return link ? NextResponse.json({ url: link }) : NextResponse.json({ error: "That document isn't available." }, { status: 404 });
  }
  if (url.searchParams.get("receipt")) {
    const receipt = await myReceipt(sb, who.user.id, receiptParams(url.searchParams)).catch(() => null);
    return receipt ? NextResponse.json({ receipt }) : NextResponse.json({ error: "That receipt isn't available." }, { status: 404 });
  }
  return NextResponse.json(await portalData(sb, who.user.id));
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const who = await userFromRequest(sb, request);
  if (!who) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const out =
    body.action === "confirm"
      ? await confirmFix(sb, who.user.id, body)
      : body.action === "details"
        ? await updateDetails(sb, who.user.id, body)
        : { error: "Unknown action." };
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
