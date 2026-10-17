import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { bearer, userClient } from "@/lib/application-review";
import { staffUser } from "@/lib/signatures-server";
import { emailPaypropLetter } from "@/lib/tenant-notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?tenancy=<id>: a 60-second link to the PayProp welcome letter, for that tenancy's tenants or staff.
// GET ?tenancy=<id>&check=1: just whether there is one.
export async function GET(request) {
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const id = params.get("tenancy");
  // Row-level security: tenants only see their own tenancy, staff see all.
  const { data: t } = await userClient(token).from("tenancies").select("id, payprop_letter_path").eq("id", id).maybeSingle();
  if (!t?.payprop_letter_path) return NextResponse.json({ available: false }, { status: params.get("check") ? 200 : 404 });
  if (params.get("check")) return NextResponse.json({ available: true });
  const { data, error } = await getSupabaseAdmin().storage.from("tenancy-documents").createSignedUrl(t.payprop_letter_path, 60);
  if (error) return NextResponse.json({ error: "We couldn't open that file." }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}

// POST { tenancy }: staff only. Emails the uploaded letter to the tenants (as an attachment).
export async function POST(request) {
  const admin = getSupabaseAdmin();
  if (!(await staffUser(admin, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { tenancy } = await request.json().catch(() => ({}));
  try {
    const r = await emailPaypropLetter(admin, tenancy);
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
