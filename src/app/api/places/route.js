import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Address suggestions from Google Places (New), proxied so the API key stays on the server.
//   GET /api/places?q=1234 ouel&session=<uuid>   -> { suggestions: [{ id, main, secondary }] }
//   GET /api/places?id=<placeId>&session=<uuid>  -> { address: { line, unit, street_number, street, city, province, postal_code, formatted } }
// Without GOOGLE_MAPS_API_KEY it returns { disabled: true } and the field works as plain text.

const KEY = () => (process.env.GOOGLE_MAPS_API_KEY || "").trim();
const WINDSOR = { latitude: 42.3149, longitude: -83.0364 };

// Light per-instance limit so a public form can't be used to run up the bill.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  h.push(now);
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > 60;
}

function parse(place) {
  const get = (type, short = false) => {
    const c = (place.addressComponents || []).find((x) => (x.types || []).includes(type));
    return c ? (short ? c.shortText : c.longText) || "" : "";
  };
  const number = get("street_number");
  const street = get("route", true);
  const unit = get("subpremise");
  const city = get("locality") || get("postal_town") || get("sublocality") || get("administrative_area_level_3");
  const province = get("administrative_area_level_1", true);
  const postal = get("postal_code").toUpperCase();
  return {
    line: [number, street].filter(Boolean).join(" "),
    unit,
    street_number: number,
    street,
    city,
    province,
    postal_code: postal,
    formatted: place.formattedAddress || "",
  };
}

export async function GET(request) {
  if (!KEY()) return NextResponse.json({ disabled: true });
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  if (limited(ip)) return NextResponse.json({ suggestions: [] }, { status: 429 });

  const url = new URL(request.url);
  const session = (url.searchParams.get("session") || "").slice(0, 64);
  const id = url.searchParams.get("id");
  const headers = { "Content-Type": "application/json", "X-Goog-Api-Key": KEY() };

  try {
    if (id) {
      if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) return NextResponse.json({ error: "Bad place." }, { status: 400 });
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}${session ? `?sessionToken=${encodeURIComponent(session)}` : ""}`,
        { headers: { ...headers, "X-Goog-FieldMask": "addressComponents,formattedAddress" }, cache: "no-store" }
      );
      if (!res.ok) return NextResponse.json({ error: "Lookup failed." }, { status: 502 });
      return NextResponse.json({ address: parse(await res.json()) });
    }

    const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
    if (q.length < 3) return NextResponse.json({ suggestions: [] });
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ["ca"],
        includedPrimaryTypes: ["street_address", "premise", "subpremise"],
        locationBias: { circle: { center: WINDSOR, radius: 50000 } },
        languageCode: "en",
        ...(session ? { sessionToken: session } : {}),
      }),
    });
    if (!res.ok) return NextResponse.json({ suggestions: [] }, { status: 502 });
    const data = await res.json();
    const suggestions = (data.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .slice(0, 5)
      .map((p) => ({
        id: p.placeId,
        main: p.structuredFormat?.mainText?.text || p.text?.text || "",
        secondary: p.structuredFormat?.secondaryText?.text || "",
      }));
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 502 });
  }
}
