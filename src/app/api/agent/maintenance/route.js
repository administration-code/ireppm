import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { CATEGORIES, URGENCY, estimateFromForm, estimateProblem } from "@/lib/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHOLE = "Whole property";
const clip = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

// The signed-in partner (contractor or showing agent), matched by their email like my_partner_id().
async function partnerFor(sb, request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  const email = String(data?.user?.email || "").trim().toLowerCase();
  if (error || !email) return null;
  const { data: partners } = await sb.from("partners").select("id, name, phone, email").eq("active", true).not("email", "is", null);
  const partner = (partners || []).find((p) => String(p.email).trim().toLowerCase() === email);
  return partner ? { ...partner, userId: data.user.id } : null;
}

async function assignedProperties(sb, partnerId) {
  const { data: links } = await sb.from("property_agents").select("property_id").eq("partner_id", partnerId);
  const ids = [...new Set((links || []).map((l) => l.property_id))];
  if (!ids.length) return [];
  const { data } = await sb
    .from("properties")
    .select("id, address, city, units(id, label, status)")
    .in("id", ids)
    .eq("archived", false)
    .order("address");
  return (data || []).map((p) => ({
    id: p.id,
    address: p.address,
    city: p.city,
    units: (p.units || [])
      .filter((u) => u.label !== WHOLE && !/^Other \(/.test(u.label))
      .map((u) => ({ id: u.id, label: u.label }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), "en-CA", { numeric: true })),
  }));
}

// GET: the partner's properties and units to choose from.
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFor(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  return NextResponse.json({ properties: await assignedProperties(sb, partner.id) });
}

// POST: log a maintenance request at one of the partner's properties. It comes in as New for
// staff to review, assigned to the partner who logged it.
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFor(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const propertyId = String(body?.property_id || "");
  const unitId = String(body?.unit_id || "");
  const title = clip(body?.title, 120);
  const description = clip(body?.description, 4000);
  const category = CATEGORIES[body?.category] ? body.category : "other";
  const urgency = URGENCY[body?.urgency] ? body.urgency : "routine";
  if (!UUID.test(propertyId)) return NextResponse.json({ error: "Choose the property." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Give the problem a short title." }, { status: 400 });
  if (!description) return NextResponse.json({ error: "Describe the problem." }, { status: 400 });
  const estProblem = estimateProblem(body?.est_repair, "repair estimate") || estimateProblem(body?.est_replace, "replacement cost");
  if (estProblem) return NextResponse.json({ error: estProblem }, { status: 400 });
  const done = body?.already_done === true;
  const settled = done && body?.settled_direct === true;
  const est = settled ? { estimated_cost: null, note: "" } : estimateFromForm(body?.est_repair, body?.est_replace);

  const props = await assignedProperties(sb, partner.id);
  const property = props.find((p) => p.id === propertyId);
  if (!property) return NextResponse.json({ error: "That isn't one of your properties." }, { status: 403 });

  let unit = unitId && UUID.test(unitId) ? property.units.find((u) => u.id === unitId)?.id : null;
  if (unitId && !unit) return NextResponse.json({ error: "Choose a unit at that property." }, { status: 400 });
  if (!unit) {
    // Shared areas and outside: the property's "Whole property" helper unit.
    const found = await sb.from("units").select("id").eq("property_id", propertyId).eq("label", WHOLE).maybeSingle();
    unit = found.data?.id;
    if (!unit) {
      const made = await sb
        .from("units")
        .insert({
          property_id: propertyId,
          label: WHOLE,
          unit_type: "House",
          status: "offline",
          management_type: "leasing_only",
          notes: "Created automatically for maintenance that isn't tied to one leased unit.",
        })
        .select("id")
        .single();
      unit = made.data?.id;
    }
    if (!unit) return NextResponse.json({ error: "We couldn't save that. Try again." }, { status: 500 });
  }

  // Photos the partner uploaded to their own folder.
  const photos = (Array.isArray(body?.photos) ? body.photos : [])
    .filter((p) => typeof p?.path === "string" && p.path.startsWith(`${partner.userId}/`))
    .slice(0, 15)
    .map((p) => ({ path: p.path, name: clip(p.name, 120) || "photo" }));

  // The tenancy living in that unit, so staff see who's affected.
  let tenancyId = null;
  if (unitId) {
    const { data: t } = await sb
      .from("tenancies")
      .select("id")
      .eq("unit_id", unit)
      .in("status", ["active", "notice"])
      .order("start_date", { ascending: false })
      .limit(1);
    tenancyId = t?.[0]?.id || null;
  }

  const { data: created, error } = await sb
    .from("maintenance_requests")
    .insert({
      unit_id: unit,
      tenancy_id: tenancyId,
      source: "staff",
      category,
      urgency,
      title,
      description: [description, est.note, settled ? "Work completed and settled directly with the landlord; nothing billed through IRep." : done ? "Work completed." : ""]
        .filter(Boolean)
        .join("\n\n"),
      estimated_cost: est.estimated_cost,
      estimate_plus_hst: est.estimated_cost != null,
      photos,
      status: done ? "completed" : "new",
      completed_at: done ? new Date().toISOString() : null,
      partner_id: partner.id,
      reporter_name: partner.name,
      reporter_phone: partner.phone || null,
      reporter_email: partner.email,
      permission_to_enter: false,
      staff_notes: `Logged by ${partner.name} through the Agent Portal${
        settled ? " as completed and settled directly with the landlord (nothing to bill)" : done ? " as already completed" : ""
      }.`,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[agent/maintenance] insert failed:", error.message);
    return NextResponse.json({ error: "We couldn't save that. Try again." }, { status: 500 });
  }
  return NextResponse.json({ id: created.id });
}
