import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffUser } from "@/lib/signatures-server";
import { lawnSnowAdvice, lookupLot } from "@/lib/lot-size";

export const runtime = "nodejs";

export async function GET(request) {
  const staff = await staffUser(getSupabaseAdmin(), request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const address = new URL(request.url).searchParams.get("address") || "";
  const hit = lookupLot(address);
  if (!hit) return NextResponse.json({ found: false, advice: lawnSnowAdvice(null) });
  return NextResponse.json({ found: true, ...hit, advice: lawnSnowAdvice(hit.lot) });
}
