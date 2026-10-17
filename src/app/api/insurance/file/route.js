import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { bearer, userClient } from "@/lib/application-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A 60-second link to a proof of insurance, for the tenant, staff or the property's landlord.
// GET ?id=<tenant_insurance id>  with  Authorization: Bearer <session token>
export async function GET(request) {
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  // Row-level security decides who may see it.
  const { data: row } = await userClient(token).from("tenant_insurance").select("id, file_path").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { data, error } = await getSupabaseAdmin().storage.from("tenant-insurance").createSignedUrl(row.file_path, 60);
  if (error) return NextResponse.json({ error: "We couldn't open that file." }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
