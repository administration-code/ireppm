import { NextResponse } from "next/server";
import { inspectionsDue, managedOf, needsInspection } from "@/lib/inspection-due";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerProperties, partnerFromRequest } from "@/lib/server-auth";
import { markJobDone, markNonIssue, partnerDoneJobs, partnerEstimates, landlordBookings, submitEstimate } from "@/lib/job-done";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agent Portal: "Job done".   GET → { done: [job ids waiting for IRep's review] }
//   POST { id, done_on, notes, price, no_charge, photos: [{ path, name }] }  (fixed on site)
//   POST { outcome: "estimate", id, scope, price, photos }   POST { outcome: "non_issue", id, notes, photos }
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  const [done, bookings, due, estimates] = await Promise.all([
    partnerDoneJobs(sb, partner.id),
    landlordBookings(sb, partner.id, partner.name).catch(() => ({})),
    partnerProperties(sb, partner.id)
      .then((props) => managedOf(sb, props))
      .then((props) => inspectionsDue(sb, props))
      .catch(() => []),
    partnerEstimates(sb, partner.id).catch(() => ({})),
  ]);
  return NextResponse.json({ done, bookings, estimates, inspectionsDue: due.filter(needsInspection).length });
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  // After a visit he picks one: Fixed on Site (default), Needs an Estimate, or Not an Issue.
  const body = await request.json().catch(() => ({}));
  const out =
    body.outcome === "estimate" ? await submitEstimate(sb, partner, body) : body.outcome === "non_issue" ? await markNonIssue(sb, partner, body) : await markJobDone(sb, partner, body);
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
