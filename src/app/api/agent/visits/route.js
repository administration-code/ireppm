import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest, partnerProperties } from "@/lib/server-auth";
import { cleanPhotos } from "@/lib/inspection-reports";
import { PHOTO_BUCKET } from "@/lib/maintenance";
import { lawnSnowBoard } from "@/lib/lawn-snow";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { money } from "@/lib/format";
import { SITE } from "@/lib/site";

// A per-visit lawn or snow job is done: the landlord hears what was done and what they'll be billed.
async function tellLandlord(sb, row, kind, charge, today) {
  if (!mailConfigured()) return;
  const { data: p } = await sb.from("properties").select("address, owner:owners(name, email)").eq("id", row.id).maybeSingle();
  const to = p?.owner?.email;
  if (!to) return;
  const what = kind === "lawn" ? "Lawn cut" : "Snow cleared";
  const total = charge.charge_amount + charge.charge_hst;
  const rows = [
    ["Property", p.address],
    ["Done", `${what} on ${today}`],
    ["Charge", `${money(charge.charge_amount)} + ${money(charge.charge_hst)} HST = ${money(total)}`],
  ];
  const heading = `${what}: ${p.address}`;
  const intro = `Hi ${String(p.owner.name || "").split(" ")[0] || "there"}, ${what.toLowerCase()} at ${p.address} today. Your property isn't on the monthly lawn and snow plan, so this visit is billed on its own.`;
  await mailer().emails.send({
    from: `IRep Property Management <${SITE.email}>`,
    to: [to],
    cc: [SITE.email],
    replyTo: SITE.email,
    subject: `${what}: ${p.address}`,
    html: renderEmail({ heading, intro, rows, link: { href: "https://ireppm.ca/owner", label: "Open My Landlord Portal" } }),
    text: renderText({ heading, rows, extra: intro, link: { href: "https://ireppm.ca/owner", label: "Open My Landlord Portal" } }),
  });
}

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
  // Per-visit properties: the amount the landlord is charged, confirmed by Chuck (plus 13% HST).
  const board = await lawnSnowBoard(sb, props.filter((p) => p.id === body.property_id));
  const row = [...board.included, ...board.alaCarte][0];
  let charge = null;
  if (row && !row.included) {
    const n = Number(String(body.charge_amount ?? row.fee.amount).replace(/[$,\s]/g, ""));
    if (!(n >= 0 && n < 10000)) return NextResponse.json({ error: "Check the amount charged to the landlord." }, { status: 400 });
    charge = { charge_amount: Math.round(n * 100) / 100, charge_hst: Math.round(n * 13) / 100 };
  }
  const asked = row?.requests?.find((r) => r.id === body.request_id) || row?.requests?.find((r) => r.kind === body.kind) || null;
  let ins = await sb
    .from("service_visits")
    .insert({ property_id: body.property_id, partner_id: partner.id, kind: body.kind, visited_on: today, photos, note, ...(charge || {}), ...(asked ? { request_id: asked.id } : {}) })
    .select("id")
    .single();
  if (ins.error && /charge_|request_id/.test(ins.error.message || ""))
    ins = await sb.from("service_visits").insert({ property_id: body.property_id, partner_id: partner.id, kind: body.kind, visited_on: today, photos, note }).select("id").single();
  const error = ins.error;
  if (!error && asked) await sb.from("lawn_snow_requests").update({ status: "done", done_at: new Date().toISOString(), visit_id: ins.data.id }).eq("id", asked.id);
  if (!error && charge) await tellLandlord(sb, row, body.kind, charge, today).catch(() => null);
  if (error) {
    if (photos.length) await sb.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.path));
    return NextResponse.json({ error: "Logging visits isn't switched on yet. Tell Rosie." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
