import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest } from "@/lib/server-auth";
import { markJobDone, partnerDoneJobs, landlordBookings } from "@/lib/job-done";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agent Portal: "Job done".   GET → { done: [job ids waiting for IRep's review] }
//   POST { id, done_on, notes, price, no_charge, photos: [{ path, name }] }
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  const [done, bookings] = await Promise.all([partnerDoneJobs(sb, partner.id), landlordBookings(sb, partner.id, partner.name).catch(() => ({}))]);
  return NextResponse.json({ done, bookings });
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  const out = await markJobDone(sb, partner, await request.json().catch(() => ({})));
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
