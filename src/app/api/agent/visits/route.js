import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest, partnerProperties } from "@/lib/server-auth";
import { cleanPhotos } from "@/lib/inspection-reports";
import { PHOTO_BUCKET } from "@/lib/maintenance";
import { lawnSnowBoard } from "@/lib/lawn-snow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["lawn", "snow"];

// Agent Portal: lawn and snow visits.
//   GET → { included: [...], alaCarte: [...], rates } (each property with its fee and last lawn and snow visits)
//   POST { property_id, kind: "lawn" | "snow", photos: [{ path, name }], note }   POST { action: "delete", id } (today's own only)
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  const properties = await partnerProperties(sb, partner.id);
  const board = await lawnSnowBoard(sb, properties);
  return NextResponse.json(board);
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
