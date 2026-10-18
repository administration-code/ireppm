import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { bearer } from "@/lib/application-review";
import { reviewerRoles, submitReview } from "@/lib/reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser(admin, request) {
  const token = bearer(request);
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data?.user || null;
}

// Can the signed-in person leave a review, and as what?
export async function GET(request) {
  const admin = getSupabaseAdmin();
  const user = await currentUser(admin, request);
  if (!user) return NextResponse.json({ signedIn: false, tenant: false, landlord: false });
  return NextResponse.json({ signedIn: true, ...(await reviewerRoles(admin, user.id)) });
}

export async function POST(request) {
  const admin = getSupabaseAdmin();
  const user = await currentUser(admin, request);
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await submitReview(admin, body, user));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
