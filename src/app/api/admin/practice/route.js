import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROPERTY = "00000000-0000-4000-8000-00000000a002";

// Staff: clear everything Chuck logged at the practice property (1 Practice St), so it's fresh for next time.
//   GET → counts of what's there.   POST → deletes it.
async function practiceIds(sb) {
  const { data: units } = await sb.from("units").select("id, listing_id").eq("property_id", PROPERTY);
  const unitIds = (units || []).map((u) => u.id);
  const { data: ten } = unitIds.length ? await sb.from("tenancies").select("id").in("unit_id", unitIds) : { data: [] };
  return { unitIds, listingIds: (units || []).map((u) => u.listing_id).filter(Boolean), tenancyIds: (ten || []).map((t) => t.id) };
}

export async function GET(request) {
  const sb = getSupabaseAdmin();
  if (!(await staffFromRequest(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { unitIds, listingIds, tenancyIds } = await practiceIds(sb);
  if (!unitIds.length) return NextResponse.json({ ready: false });
  const [m, c, l] = await Promise.all([
    sb.from("maintenance_requests").select("id", { count: "exact", head: true }).in("unit_id", unitIds),
    tenancyIds.length ? sb.from("cash_collections").select("id", { count: "exact", head: true }).in("tenancy_id", tenancyIds) : { count: 0 },
    listingIds.length ? sb.from("listings").select("id", { count: "exact", head: true }).in("id", listingIds) : { count: 0 },
  ]);
  return NextResponse.json({ ready: true, requests: m.count || 0, cash: c.count || 0, vacancies: l.count || 0 });
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  if (!(await staffFromRequest(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { unitIds, listingIds, tenancyIds } = await practiceIds(sb);
  if (!unitIds.length) return NextResponse.json({ error: "The practice property isn't set up." }, { status: 400 });
  if (tenancyIds.length) {
    const { data: cash } = await sb.from("cash_collections").select("id, deposit_id").in("tenancy_id", tenancyIds);
    const deposits = [...new Set((cash || []).map((c) => c.deposit_id).filter(Boolean))];
    await sb.from("cash_collections").delete().in("tenancy_id", tenancyIds);
    if (deposits.length) await sb.from("cash_deposits").delete().in("id", deposits);
    await sb.from("payments").delete().in("tenancy_id", tenancyIds);
  }
  await sb.from("maintenance_requests").delete().in("unit_id", unitIds);
  if (listingIds.length) {
    await sb.from("units").update({ listing_id: null }).in("id", unitIds);
    await sb.from("showing_requests").delete().in("listing_id", listingIds);
    await sb.from("applications").delete().in("listing_id", listingIds); // practice applications (administration+applicant@)
    await sb.from("listings").delete().in("id", listingIds);
  }
  return NextResponse.json({ ok: true });
}
