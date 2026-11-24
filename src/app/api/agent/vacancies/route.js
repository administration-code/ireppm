import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest } from "@/lib/server-auth";
import { addPhotos, closeVacancy, logShowing, photoUploadLinks, removePhoto, startVacancy, updateVacancy, vacancyBoard } from "@/lib/vacancies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agent Portal: vacancies at properties where the partner does showings.
//   GET → { units, vacancies }
//   POST { action: "start", unit_id, rent, available_on, property_type, beds, baths, utilities, description, visibility }
//   POST { action: "update", id, ...same fields }   POST { action: "close", id, rented }
//   POST { action: "photo-links", id, files: [{ name, type }] } → upload links; then { action: "photos-add", id, paths }
//   POST { action: "photo-remove", id, url }
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  return NextResponse.json(await vacancyBoard(sb, partner.id));
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const out =
    body.action === "start"
      ? await startVacancy(sb, partner, body)
      : body.action === "update"
        ? await updateVacancy(sb, partner, body)
        : body.action === "close"
          ? await closeVacancy(sb, partner, body)
          : body.action === "photo-links"
            ? await photoUploadLinks(sb, partner, body)
            : body.action === "photos-add"
              ? await addPhotos(sb, partner, body)
              : body.action === "photo-remove"
                ? await removePhoto(sb, partner, body)
                : body.action === "showed"
                  ? await logShowing(sb, partner, body)
                  : { error: "Unknown action." };
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
