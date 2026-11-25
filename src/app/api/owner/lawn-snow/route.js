import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerIdsFromRequest } from "@/lib/server-auth";
import { lawnSnowBoard } from "@/lib/lawn-snow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Landlord portal: each managed property's lawn and snow price (plus HST) and the last visits.
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const ownerIds = await ownerIdsFromRequest(sb, request);
  if (!ownerIds?.length) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: props } = await sb.from("properties").select("id, management_package").in("owner_id", ownerIds);
  const board = await lawnSnowBoard(sb, (props || []).filter((p) => p.management_package !== "leasing_only"));
  const strip = (r) => ({ id: r.id, included: r.included, fee: r.fee, lastLawn: r.lastLawn?.on || null, lastSnow: r.lastSnow?.on || null });
  return NextResponse.json({ properties: [...board.included, ...board.alaCarte].map(strip) });
}
