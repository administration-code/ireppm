import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { userFromRequest } from "@/lib/server-auth";
import { lawnSnowBoard } from "@/lib/lawn-snow";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tenant portal: who looks after lawn and snow at their home.
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const who = await userFromRequest(sb, request);
  if (!who) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data } = await sb
    .from("tenancy_tenants")
    .select("tenancy:tenancies!inner(status, unit:units!inner(property:properties!inner(id, address, management_package)))")
    .eq("profile_id", who.user.id)
    .in("tenancy.status", ["active", "notice", "upcoming"]);
  const props = [...new Map((data || []).map((r) => r.tenancy?.unit?.property).filter(Boolean).filter((p) => p.management_package !== "leasing_only").map((p) => [p.id, p])).values()];
  const board = await lawnSnowBoard(sb, props);
  return NextResponse.json({
    homes: [...board.included, ...board.alaCarte].map((r) => ({
      address: r.address,
      included: r.included,
      text: r.included
        ? `Lawn care and snow clearing are included. For snow clearing, call ${SITE.emergency.name} at ${SITE.emergency.phone} to arrange it.`
        : "IRep doesn't look after the lawn or snow clearing here. Check your lease for who's responsible; snow clearing is the tenant's or landlord's job unless the city issues a notice.",
    })),
  });
}
