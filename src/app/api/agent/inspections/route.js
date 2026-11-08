import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest, partnerProperties } from "@/lib/server-auth";
import { reportProblem, saveReport } from "@/lib/inspection-reports";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET: the vendor's properties and units, for the form.
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  return NextResponse.json({ properties: await partnerProperties(sb, partner.id) });
}

// POST: a vendor submits an inspection report for one of their properties.
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const partner = await partnerFromRequest(sb, request);
  if (!partner) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
  let form;
  try {
    form = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!UUID.test(String(form?.property_id || ""))) return NextResponse.json({ error: "Choose the property." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form?.inspected_on || ""))) form.inspected_on = new Date().toISOString().slice(0, 10);
  form.units = Array.isArray(form.units) ? form.units : [];
  form.items = (Array.isArray(form.items) ? form.items : []).map((i) => ({
    unit_id: String(i?.unit_id || ""),
    description: String(i?.description || ""),
    details: String(i?.details || ""),
  }));
  const problem = reportProblem(form);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const property = (await partnerProperties(sb, partner.id)).find((p) => p.id === form.property_id);
  if (!property) return NextResponse.json({ error: "That isn't one of your properties." }, { status: 403 });

  let id;
  try {
    id = await saveReport(sb, form, {
      partnerId: partner.id,
      inspectedBy: partner.name,
      createdBy: partner.userId,
      allowedUnitIds: property.units.map((u) => u.id),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  // Let staff know it's ready to review.
  const to = (process.env.STAFF_ALERT_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (to.length && mailConfigured()) {
    const items = form.items.filter((i) => i.description.trim()).length;
    const rows = [
      ["Property", property.address],
      ["Inspected by", partner.name],
      ["Date", form.inspected_on],
      ["Recommended improvements", String(items)],
    ];
    const link = { href: `https://ireppm.ca/admin/inspection-reports/${id}`, label: "Review the report" };
    const heading = "New Inspection Report";
    await mailer()
      .emails.send({
        from: "IRep Property Management <alerts@ireppm.ca>",
        to,
        subject: `Inspection Report: ${property.address}`,
        html: renderEmail({ heading, intro: "A vendor submitted an inspection report. Review it, then send the improvements to the landlord.", rows, link }),
        text: renderText({ heading, rows, link }),
      })
      .catch(() => {});
  }
  return NextResponse.json({ id });
}
