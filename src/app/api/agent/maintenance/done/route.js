import { NextResponse } from "next/server";
import { inspectionsDue, managedOf, needsInspection } from "@/lib/inspection-due";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerProperties, partnerFromRequest } from "@/lib/server-auth";
import { markJobDone, partnerDoneJobs, landlordBookings } from "@/lib/job-done";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agent Portal: "Job done".   GET → { done: [job ids waiting for IRep's review] }
//   POST { id, done_on, notes, price, no_charge, photos: [{ path, name }] }
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  const [done, bookings, due] = await Promise.all([
    partnerDoneJobs(sb, partner.id),
    landlordBookings(sb, partner.id, partner.name).catch(() => ({})),
    partnerProperties(sb, partner.id)
      .then((props) => managedOf(sb, props))
      .then((props) => inspectionsDue(sb, props))
      .catch(() => []),
  ]);
  return NextResponse.json({ done, bookings, inspectionsDue: due.filter(needsInspection).length });
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  const out = await markJobDone(sb, partner, await request.json().catch(() => ({})));
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
