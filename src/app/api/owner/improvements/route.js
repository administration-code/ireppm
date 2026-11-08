import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerIdsFromRequest } from "@/lib/server-auth";
import { loadReport } from "@/lib/inspection-reports";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only what the landlord should see: no vendor names or internal links.
function forOwner(r) {
  return {
    id: r.id,
    inspected_on: r.inspected_on,
    sent_at: r.sent_at,
    property: { address: r.property?.address, city: r.property?.city },
    checks: {
      furnace_filter_swapped: r.furnace_filter_swapped,
      water_valve_set: r.water_valve_set,
      gutter_condition: r.gutter_condition,
      pests: r.pests,
      pests_note: r.pests_note,
    },
    notes: r.notes,
    units: r.units.map((u) => ({ label: u.unit?.label, stove: u.stove, fridge: u.fridge, washer: u.washer, dryer: u.dryer, notes: u.notes })),
    items: r.items.map((i) => ({
      id: i.id,
      description: i.description,
      details: i.details,
      unit: i.unit?.label && i.unit.label !== "Whole property" ? i.unit.label : null,
      decision: i.decision,
      decided_at: i.decided_at,
      owner_note: i.owner_note,
      price: i.price,
    })),
  };
}

async function ownedReport(sb, ownerIds, id) {
  const r = await loadReport(sb, id);
  if (!r || r.status === "submitted" || !ownerIds.includes(r.property?.owner?.id)) return null;
  return r;
}

// GET ?id=… one report; no id: the owner's sent reports with counts.
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const ownerIds = await ownerIdsFromRequest(sb, request);
  if (!ownerIds.length) return NextResponse.json({ error: "Landlord sign-in required." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: "Invalid report." }, { status: 400 });
    const r = await ownedReport(sb, ownerIds, id);
    return r ? NextResponse.json({ report: forOwner(r) }) : NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  const { data: props } = await sb.from("properties").select("id").in("owner_id", ownerIds);
  const pids = (props || []).map((p) => p.id);
  if (!pids.length) return NextResponse.json({ reports: [] });
  const { data } = await sb
    .from("inspection_reports")
    .select("id, inspected_on, sent_at, property:properties(address), items:improvement_items(decision)")
    .in("property_id", pids)
    .neq("status", "submitted")
    .order("inspected_on", { ascending: false })
    .limit(24);
  return NextResponse.json({
    reports: (data || []).map((r) => ({
      id: r.id,
      inspected_on: r.inspected_on,
      address: r.property?.address,
      pending: (r.items || []).filter((i) => i.decision === "pending").length,
      total: (r.items || []).length,
    })),
  });
}

// POST { id, decisions: [{ item_id, decision: "approved"|"declined", note }] }
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const ownerIds = await ownerIdsFromRequest(sb, request);
  if (!ownerIds.length) return NextResponse.json({ error: "Landlord sign-in required." }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const id = String(body?.id || "");
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  const r = await ownedReport(sb, ownerIds, id);
  if (!r) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const valid = new Map(r.items.map((i) => [i.id, i]));
  const decisions = (Array.isArray(body?.decisions) ? body.decisions : []).filter(
    (d) => valid.has(d?.item_id) && ["approved", "declined"].includes(d?.decision)
  );
  if (!decisions.length) return NextResponse.json({ error: "Choose approve or decline for at least one item." }, { status: 400 });
  const now = new Date().toISOString();
  const changed = [];
  for (const d of decisions) {
    const note = typeof d.note === "string" && d.note.trim() ? d.note.trim().slice(0, 1000) : null;
    const before = valid.get(d.item_id);
    if (before.decision === d.decision && (before.owner_note || null) === note) continue;
    const { error } = await sb.from("improvement_items").update({ decision: d.decision, decided_at: now, owner_note: note }).eq("id", d.item_id);
    if (error) return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    changed.push({ ...before, decision: d.decision, owner_note: note });
  }

  // Tell staff what the landlord decided.
  const to = (process.env.STAFF_ALERT_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (changed.length && to.length && mailConfigured()) {
    const rows = changed.map((i) => [
      i.decision === "approved" ? "Approved" : "Declined",
      `${i.description}${i.owner_note ? ` (note: ${i.owner_note})` : ""}`,
    ]);
    const link = { href: `https://ireppm.ca/admin/inspection-reports/${id}`, label: "Open the report" };
    const heading = "Landlord Decided on Improvements";
    await mailer()
      .emails.send({
        from: "IRep Property Management <alerts@ireppm.ca>",
        to,
        subject: `Improvements decided: ${r.property?.address}`,
        html: renderEmail({ heading, intro: `${r.property?.owner?.name || "The landlord"} answered on ${r.property?.address}. Price the approved items.`, rows, link }),
        text: renderText({ heading, rows, link }),
      })
      .catch(() => {});
  }
  const fresh = await loadReport(sb, id);
  return NextResponse.json({ report: forOwner(fresh) });
}
