import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerIdsFromRequest } from "@/lib/server-auth";
import { loadReport, reportPhotoPaths, itemCategory, QUOTE_CONTACT } from "@/lib/inspection-reports";
import { reportContact } from "@/lib/inspection-send";
import { ensureSpecialUnit } from "@/lib/maintenance-units";
import { pushTo } from "@/lib/push";
import { money } from "@/lib/format";
import { PHOTO_BUCKET } from "@/lib/maintenance";
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
    contact: { name: r.partner_id ? QUOTE_CONTACT.name : "IRep", email: reportContact(r) },
    priced: r.items.some((i) => i.price != null),
    property: { address: r.property?.address, city: r.property?.city },
    checks: {
      furnace_filter_swapped: r.furnace_filter_swapped,
      water_valve_set: r.water_valve_set,
      gutter_condition: r.gutter_condition,
      roof_condition: r.roof_condition || null,
      pests: r.pests,
      pests_note: r.pests_note,
      photos: r.photos || {},
    },
    notes: r.notes,
    units: r.units.map((u) => ({ label: u.unit?.label, stove: u.stove, fridge: u.fridge, washer: u.washer, dryer: u.dryer, notes: u.notes, photos: u.photos || {} })),
    items: r.items.map((i) => ({
      id: i.id,
      description: i.description,
      details: i.details,
      unit: i.unit?.label && i.unit.label !== "Whole property" ? i.unit.label : null,
      decision: i.decision,
      decided_at: i.decided_at,
      owner_note: i.owner_note,
      price: i.price,
      photos: i.photos || [],
    })),
  };
}

async function ownedReport(sb, ownerIds, id) {
  const r = await loadReport(sb, id);
  if (!r || !["sent", "closed"].includes(r.status) || !ownerIds.includes(r.property?.owner?.id)) return null;
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
    if (!r) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    // Viewing links for the report's photos (valid a day).
    const paths = reportPhotoPaths(r);
    let urls = {};
    if (paths.length) {
      const { data } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 86400);
      urls = Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    }
    return NextResponse.json({ report: { ...forOwner(r), photo_urls: urls } });
  }
  const { data: props } = await sb.from("properties").select("id").in("owner_id", ownerIds);
  const pids = (props || []).map((p) => p.id);
  if (!pids.length) return NextResponse.json({ reports: [] });
  const { data } = await sb
    .from("inspection_reports")
    .select("id, inspected_on, sent_at, property:properties(address), items:improvement_items(decision)")
    .in("property_id", pids)
    .in("status", ["sent", "closed"])
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

  // Approved items become jobs on the inspector's Open Jobs list, billed on a separate invoice.
  const jobs = [];
  for (const i of changed.filter((c) => c.decision === "approved" && !c.maintenance_request_id && r.partner_id)) {
    try {
      const unitId = i.unit_id || (await ensureSpecialUnit(sb, r.property_id, "whole"));
      const estimate = i.price != null ? `Landlord approved the estimate of ${money(i.price)} + HST on ${now.slice(0, 10)}.` : "Landlord approved it; no price was given yet.";
      const row = {
        unit_id: unitId,
        source: "inspection",
        category: itemCategory(i),
        title: i.description.slice(0, 200),
        description: [i.details, `From the inspection on ${r.inspected_on}. ${estimate}`, i.owner_note ? `Landlord's note: ${i.owner_note}` : "", "Bill the landlord on a separate invoice; not deducted from rent."]
          .filter(Boolean)
          .join("\n\n"),
        urgency: "routine",
        status: "triaged",
        partner_id: r.partner_id,
        estimated_cost: i.price,
        estimate_plus_hst: i.price != null,
        owner_approval: "approved",
        owner_decision_at: now,
        charge_to: "owner_invoice",
        photos: (i.photos || []).map((p) => ({ ...p, stage: "before" })),
      };
      let ins = await sb.from("maintenance_requests").insert(row).select("id").single();
      // Before migration 0090 'owner_invoice' isn't allowed: leave who pays blank for staff to set.
      if (ins.error && /charge_to/.test(ins.error.message || "")) ins = await sb.from("maintenance_requests").insert({ ...row, charge_to: null }).select("id").single();
      if (ins.error) continue;
      await sb.from("improvement_items").update({ maintenance_request_id: ins.data.id }).eq("id", i.id);
      jobs.push({ ...i, job_id: ins.data.id });
    } catch {}
  }
  if (jobs.length) {
    const place = r.property?.address || "the property";
    await pushTo(sb, { partnerId: r.partner_id }, {
      title: `Approved: ${jobs.length} job${jobs.length === 1 ? "" : "s"} at ${place}`,
      body: jobs.map((j) => j.description).join(", ").slice(0, 160),
      url: "/agent#jobs",
      tag: `approved-${id}`,
    }).catch(() => {});
    const chuckEmail = r.partner?.email;
    if (chuckEmail && mailConfigured()) {
      const rows = jobs.map((j) => [j.description, j.price != null ? `${money(j.price)} + HST` : "No price yet"]);
      const owner = r.property?.owner;
      const link = { href: "https://ireppm.ca/agent#jobs", label: "Open your jobs" };
      const heading = "Landlord Approved Work";
      await mailer()
        .emails.send({
          from: "IRep Property Management <alerts@ireppm.ca>",
          to: [chuckEmail],
          cc: ["administration@ireppm.ca"],
          subject: `Approved work: ${place}`,
          html: renderEmail({
            heading,
            intro: `${owner?.name || "The landlord"} approved these from your inspection at ${place}. They're on your Open Jobs list. Email them at ${owner?.email || "their email on file"} to book a time, then use Job Done when it's finished. It's billed on a separate invoice.`,
            rows,
            link,
          }),
          text: renderText({ heading, rows, link }),
        })
        .catch(() => {});
    }
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
        html: renderEmail({ heading, intro: `${r.property?.owner?.name || "The landlord"} answered on ${r.property?.address}.${jobs.length ? ` ${jobs.length} approved item${jobs.length === 1 ? " is" : "s are"} now on ${r.partner?.name || "the contractor"}'s Open Jobs list (separate invoice).` : r.items.some((i) => i.price != null) ? "" : " Price the approved items."}`, rows, link }),
        text: renderText({ heading, rows, link }),
      })
      .catch(() => {});
  }
  const fresh = await loadReport(sb, id);
  return NextResponse.json({ report: forOwner(fresh) });
}
