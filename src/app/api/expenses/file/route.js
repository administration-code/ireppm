import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerIdsFromRequest, staffFromRequest } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A 60-second link to an Additional Expense's bill, for staff or the property's landlord.
// GET ?id=<landlord_expenses id>  with  Authorization: Bearer <session token>
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { data: row } = await sb
    .from("landlord_expenses")
    .select("id, invoice_path, property:properties(owner_id)")
    .eq("id", id)
    .maybeSingle();
  if (!row?.invoice_path) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const allowed =
    (await ownerIdsFromRequest(sb, request)).includes(row.property?.owner_id) || Boolean(await staffFromRequest(sb, request));
  if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { data, error } = await sb.storage.from("landlord-expenses").createSignedUrl(row.invoice_path, 60);
  if (error) return NextResponse.json({ error: "We couldn't open that file." }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
