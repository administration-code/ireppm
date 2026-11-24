import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest, partnerProperties } from "@/lib/server-auth";
import { cleanPhotos } from "@/lib/inspection-reports";
import { PHOTO_BUCKET } from "@/lib/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["lawn", "snow"];

// Agent Portal: lawn and snow visits.
//   GET → { properties, visits (last 30 days, with photo links) }
//   POST { property_id, kind: "lawn" | "snow", photos: [{ path, name }], note }   POST { action: "delete", id } (today's own only)
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  const properties = await partnerProperties(sb, partner.id);
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("service_visits")
    .select("id, property_id, kind, visited_on, photos, note, created_at, property:properties(address)")
    .eq("partner_id", partner.id)
    .gte("visited_on", since)
    .order("visited_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);
  return NextResponse.json({
    ready: !error,
    properties: properties.map((p) => ({ id: p.id, address: p.address })),
    visits: (data || []).map((v) => ({ id: v.id, kind: v.kind, visited_on: v.visited_on, address: v.property?.address, photos: (v.photos || []).length, note: v.note })),
  });
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

  if (body.action === "delete") {
    await sb.from("service_visits").delete().eq("id", String(body.id || "")).eq("partner_id", partner.id).eq("visited_on", today);
    return NextResponse.json({ ok: true });
  }

  const props = await partnerProperties(sb, partner.id);
  if (!props.some((p) => p.id === body.property_id)) return NextResponse.json({ error: "Tap the property." }, { status: 400 });
  if (!KINDS.includes(body.kind)) return NextResponse.json({ error: "Tap Lawn or Snow." }, { status: 400 });
  const photos = cleanPhotos(body.photos, `${partner.userId}/`);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null;
  const { error } = await sb.from("service_visits").insert({ property_id: body.property_id, partner_id: partner.id, kind: body.kind, visited_on: today, photos, note });
  if (error) {
    if (photos.length) await sb.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.path));
    return NextResponse.json({ error: "Logging visits isn't switched on yet. Tell Rosie." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
