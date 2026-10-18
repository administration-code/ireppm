import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { bearer } from "@/lib/application-review";
import { submitReview } from "@/lib/reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const admin = getSupabaseAdmin();
  const token = bearer(request);
  let user = null;
  if (token) {
    const { data } = await admin.auth.getUser(token);
    user = data?.user || null;
  }
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await submitReview(admin, body, user));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
