import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { mapProperties, reconcileMonth, toLines } from "@/lib/payprop-recon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Staff: PayProp reconciliation.
//   POST { rows: [...] }  the rows of PayProp's "All Payments" CSV (parsed in the browser). Re-uploading is safe.
//   GET  ?month=YYYY-MM   the month's matching.
export async function POST(request) {
  const sb = getSupabaseAdmin();
  if (!(await staffFromRequest(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const lines = toLines(Array.isArray(body.rows) ? body.rows.slice(0, 20000) : []);
  if (!lines.length) return NextResponse.json({ error: "That file doesn't look like PayProp's All Payments export (no PaymentRecordID column)." }, { status: 400 });
  for (let i = 0; i < lines.length; i += 500) {
    const { error } = await sb.from("payprop_lines").upsert(lines.slice(i, i + 500), { onConflict: "payment_record_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await mapProperties(sb, lines);
  const months = [...new Set(lines.map((l) => String(l.bank_date || l.transferred_date || "").slice(0, 7)).filter(Boolean))].sort();
  return NextResponse.json({ ok: true, lines: lines.length, months });
}

export async function GET(request) {
  const sb = getSupabaseAdmin();
  if (!(await staffFromRequest(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const month = new URL(request.url).searchParams.get("month") || "";
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "Choose a month." }, { status: 400 });
  return NextResponse.json(await reconcileMonth(sb, month));
}
