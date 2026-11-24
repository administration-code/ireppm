import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest, partnerProperties } from "@/lib/server-auth";
import { draftForm, reportProblem, saveReport } from "@/lib/inspection-reports";
import { sendReportToOwner } from "@/lib/inspection-send";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const countPhotos = (f) =>
  Object.values(f.photos || {}).flat().length +
  (f.units || []).reduce((n, u) => n + Object.values(u.photos || {}).flat().length, 0) +
  (f.items || []).reduce((n, i) => n + (i.photos || []).length, 0);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Inspections with quotes are only for properties IRep fully manages (at least one managed unit).
async function managedProperties(sb, partnerId) {
  const props = await partnerProperties(sb, partnerId);
  if (!props.length) return [];
  const { data } = await sb.from("units").select("property_id").in("property_id", props.map((p) => p.id)).eq("management_type", "managed");
  const managed = new Set((data || []).map((u) => u.property_id));
  return props.filter((p) => managed.has(p.id));
}

async function myDrafts(sb, partnerId) {
  const { data, error } = await sb
    .from("inspection_reports")
    .select("id, property_id, inspected_on, updated_at, draft, property:properties(address)")
    .eq("partner_id", partnerId)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) return [];
  return (data || []).map((d) => ({ id: d.id, property_id: d.property_id, address: d.property?.address, updated_at: d.updated_at, form: d.draft }));
}

// The last finished inspection of each property, shaped for "Start From Last Time".
async function lastInspections(sb, propertyIds) {
  if (!propertyIds.length) return {};
  const { data: reports } = await sb
    .from("inspection_reports")
    .select("id, property_id, inspected_on, gutter_condition, roof_condition")
    .in("property_id", propertyIds)
    .in("status", ["submitted", "sent", "closed"])
    .order("inspected_on", { ascending: false })
    .limit(200);
  const latest = {};
  for (const r of reports || []) if (!latest[r.property_id]) latest[r.property_id] = r;
  const ids = Object.values(latest).map((r) => r.id);
  if (!ids.length) return {};
  const [{ data: units }, { data: items }] = await Promise.all([
    sb.from("inspection_report_units").select("report_id, unit_id, stove, fridge, washer, dryer").in("report_id", ids),
    sb.from("improvement_items").select("report_id, unit_id, description, details, decision, sort").in("report_id", ids).order("sort"),
  ]);
  const out = {};
  for (const r of Object.values(latest)) {
    out[r.property_id] = {
      inspected_on: r.inspected_on,
      gutter_condition: r.gutter_condition || "",
      roof_condition: r.roof_condition || "",
      units: Object.fromEntries((units || []).filter((u) => u.report_id === r.id).map((u) => [u.unit_id, { stove: u.stove, fridge: u.fridge, washer: u.washer, dryer: u.dryer }])),
      // Approved items are already jobs; only the ones still open or turned down come forward.
      items: (items || [])
        .filter((i) => i.report_id === r.id && i.decision !== "approved")
        .map((i) => ({ unit_id: i.unit_id || "", description: i.description, details: i.details || "" })),
    };
  }
  return out;
}

// GET: the vendor's managed properties and units for the form, and any reports saved to finish later.
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  const [properties, drafts] = await Promise.all([managedProperties(sb, partner.id), myDrafts(sb, partner.id)]);
  const last = await lastInspections(sb, properties.map((p) => p.id)).catch(() => ({}));
  return NextResponse.json({ properties, drafts, last });
}

function cleanForm(form) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form?.inspected_on || ""))) form.inspected_on = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  form.units = Array.isArray(form.units) ? form.units : [];
  form.prices = form.prices && typeof form.prices === "object" ? form.prices : {};
  form.check_details = form.check_details && typeof form.check_details === "object" ? form.check_details : {};
  form.items = (Array.isArray(form.items) ? form.items : []).map((i) => ({
    key: String(i?.key || ""),
    unit_id: String(i?.unit_id || ""),
    description: String(i?.description || ""),
    details: String(i?.details || ""),
    photos: Array.isArray(i?.photos) ? i.photos : [],
  }));
  return form;
}

// POST { action: "draft", draft_id?, form }: save for later (also used for autosave).
// POST { action: "discard", draft_id }: throw away a saved report.
// POST { draft_id?, ...form }: inspection complete. Saves the report and emails it straight to the landlord.
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const draftId = UUID.test(String(body?.draft_id || "")) ? body.draft_id : null;

  if (body?.action === "discard") {
    if (draftId) await sb.from("inspection_reports").delete().eq("id", draftId).eq("partner_id", partner.id).eq("status", "draft");
    return NextResponse.json({ ok: true });
  }

  const form = cleanForm(body?.action === "draft" ? body.form || {} : body);
  if (!UUID.test(String(form?.property_id || ""))) return NextResponse.json({ error: "Choose the property." }, { status: 400 });
  const property = (await managedProperties(sb, partner.id)).find((p) => p.id === form.property_id);
  if (!property) return NextResponse.json({ error: "That isn't one of your managed properties." }, { status: 403 });

  if (body?.action === "draft") {
    let draft;
    try {
      draft = draftForm(form);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const row = { property_id: form.property_id, inspected_on: form.inspected_on, draft };
    if (draftId) {
      const { data, error } = await sb.from("inspection_reports").update(row).eq("id", draftId).eq("partner_id", partner.id).eq("status", "draft").select("id").maybeSingle();
      if (!error && data) return NextResponse.json({ draft_id: data.id, saved_at: new Date().toISOString() });
      // Already completed or deleted: don't make a new copy.
      if (!error) return NextResponse.json({ draft_id: draftId, saved_at: new Date().toISOString(), gone: true });
    }
    const { data, error } = await sb
      .from("inspection_reports")
      .insert({ ...row, partner_id: partner.id, inspected_by: partner.name, created_by: partner.userId, status: "draft" })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: "Saving for later isn't switched on yet. Finish the report now, or tell Rosie." }, { status: 500 });
    return NextResponse.json({ draft_id: data.id, saved_at: new Date().toISOString() });
  }

  const problem = reportProblem(form);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  let id;
  try {
    id = await saveReport(sb, form, {
      partnerId: partner.id,
      inspectedBy: partner.name,
      createdBy: partner.userId,
      allowedUnitIds: property.units.map((u) => u.id),
      photoPrefix: `${partner.userId}/`, // only photos this partner uploaded
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  if (draftId) await sb.from("inspection_reports").delete().eq("id", draftId).eq("partner_id", partner.id).eq("status", "draft");

  // Straight to the landlord: no staff review.
  const sent = await sendReportToOwner(sb, id, { sentBy: partner.name });

  // Let the office know (copy for records, or a heads-up if it couldn't go to the landlord).
  const to = (process.env.STAFF_ALERT_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (to.length && mailConfigured()) {
    const priced = Object.values(form.prices || {}).filter((v) => String(v).trim()).length;
    const rows = [
      ["Property", property.address],
      ["Inspected by", partner.name],
      ["Date", form.inspected_on],
      ["Items priced", String(priced)],
      ["Photos", String(countPhotos(form))],
      ["Landlord", sent.sent ? `Sent to ${sent.to}` : `NOT sent: ${sent.error}`],
    ];
    const link = { href: `https://ireppm.ca/admin/inspection-reports/${id}`, label: "Open the report" };
    const heading = sent.sent ? "Inspection Report Sent to Landlord" : "Inspection Report Needs Sending";
    await mailer()
      .emails.send({
        from: "IRep Property Management <alerts@ireppm.ca>",
        to,
        subject: `${sent.sent ? "Inspection sent" : "Inspection NOT sent"}: ${property.address}`,
        html: renderEmail({
          heading,
          intro: sent.sent
            ? `${partner.name} finished the inspection and it went straight to the landlord. Nothing to do unless something looks wrong.`
            : `${partner.name} finished the inspection but it couldn't be emailed to the landlord. Open it and send it from there.`,
          rows,
          link,
        }),
        text: renderText({ heading, rows, link }),
      })
      .catch(() => {});
  }
  return NextResponse.json({ id, sent: Boolean(sent.sent), to: sent.to || null, error: sent.error || null });
}
