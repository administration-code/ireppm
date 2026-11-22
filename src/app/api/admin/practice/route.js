import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { SIGNED_BUCKET } from "@/lib/signatures-server";
import { simplePdf } from "@/lib/practice-pdf";
import { voidEnvelope } from "@/lib/docusign";

const PAPER_TENANCY = "00000000-0000-4000-8000-00000000a005"; // Upper: served on paper by Chuck
const EMAIL_TENANCY = "00000000-0000-4000-8000-00000000a007"; // Rear: consented to email service (Rishi)
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// A practice N4, already "signed by the landlord", so the serving steps can be practised for real: Chuck's
// Notices to Serve (paper) or Rishi's Email Service (email). The certificate after it is a real DocuSign
// envelope marked TEST; Clear Practice Data voids it if it's still unsigned.
async function practiceN4(sb, staff, mode) {
  const email = mode === "email";
  const tenancyId = email ? EMAIL_TENANCY : PAPER_TENANCY;
  const { data: t } = await sb.from("tenancies").select("id, unit:units(id, label)").eq("id", tenancyId).maybeSingle();
  if (!t) return { error: "The practice tenancy isn't set up." };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const termination = addDays(today, 21);
  const title = `N4: 1 Practice St (TEST), ${t.unit.label}`;
  const { data: row, error } = await sb
    .from("signature_requests")
    .insert({
      kind: "N4",
      title,
      status: "completed",
      completed_at: new Date().toISOString(),
      tenancy_id: tenancyId,
      unit_id: t.unit.id,
      property_id: PROPERTY,
      owner_id: "00000000-0000-4000-8000-00000000a001",
      recipients: [],
      prefill: { amount_owing: 1000, termination_date: termination, practice: true },
      terms: { effective_date: termination, amount: 100000, practice: true },
      email_subject: `PRACTICE: ${title}`,
      sent_by: staff.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  const pdf = simplePdf([
    "PRACTICE N4 - NOT A REAL NOTICE",
    "This is a practice copy for the IRep Agent Portal.",
    `Address: 1 Practice St (TEST), ${t.unit.label}, Windsor`,
    `Tenant: ${email ? "Practice Email Tenant" : "Practice Tenant"}`,
    "Amount owing: $1,000.00 (practice)",
    `Termination date: ${termination}`,
    "Do not serve this on anyone.",
  ]);
  const path = `practice/${row.id}.pdf`;
  await sb.storage.from(SIGNED_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  await sb.from("signature_requests").update({ signed_file_path: path }).eq("id", row.id);
  // The same alerts as a real signed N4: Chuck's email and phone notification, or Rishi's task.
  const { notifyNoticeReady } = await import("@/lib/serve-notice-alert");
  const r = await notifyNoticeReady(row.id);
  return { ok: true, id: row.id, byEmail: Boolean(r.byEmail), sent: Boolean(r.sent) };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROPERTY = "00000000-0000-4000-8000-00000000a002";

// Staff: clear everything Chuck logged at the practice property (1 Practice St), so it's fresh for next time.
//   GET → counts of what's there.   POST → deletes it.
async function practiceIds(sb) {
  const { data: units } = await sb.from("units").select("id, listing_id").eq("property_id", PROPERTY);
  const unitIds = (units || []).map((u) => u.id);
  const { data: ten } = unitIds.length ? await sb.from("tenancies").select("id").in("unit_id", unitIds) : { data: [] };
  return { unitIds, listingIds: (units || []).map((u) => u.listing_id).filter(Boolean), tenancyIds: (ten || []).map((t) => t.id) };
}

export async function GET(request) {
  const sb = getSupabaseAdmin();
  if (!(await staffFromRequest(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { unitIds, listingIds, tenancyIds } = await practiceIds(sb);
  if (!unitIds.length) return NextResponse.json({ ready: false });
  const [m, c, l] = await Promise.all([
    sb.from("maintenance_requests").select("id", { count: "exact", head: true }).in("unit_id", unitIds),
    tenancyIds.length ? sb.from("cash_collections").select("id", { count: "exact", head: true }).in("tenancy_id", tenancyIds) : { count: 0 },
    listingIds.length ? sb.from("listings").select("id", { count: "exact", head: true }).in("id", listingIds) : { count: 0 },
  ]);
  return NextResponse.json({ ready: true, requests: m.count || 0, cash: c.count || 0, vacancies: l.count || 0 });
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const staff = await staffFromRequest(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body.action === "n4") {
    const out = await practiceN4(sb, staff, body.mode);
    return NextResponse.json(out, { status: out.error ? 400 : 200 });
  }
  const { unitIds, listingIds, tenancyIds } = await practiceIds(sb);
  if (!unitIds.length) return NextResponse.json({ error: "The practice property isn't set up." }, { status: 400 });
  if (tenancyIds.length) {
    const { data: cash } = await sb.from("cash_collections").select("id, deposit_id").in("tenancy_id", tenancyIds);
    const deposits = [...new Set((cash || []).map((c) => c.deposit_id).filter(Boolean))];
    await sb.from("cash_collections").delete().in("tenancy_id", tenancyIds);
    if (deposits.length) await sb.from("cash_deposits").delete().in("id", deposits);
    await sb.from("payments").delete().in("tenancy_id", tenancyIds);
  }
  await sb.from("maintenance_requests").delete().in("unit_id", unitIds);
  if (tenancyIds.length) {
    // Practice notices, their certificates (unsigned ones are voided in DocuSign), tasks and service records.
    const { data: sigs } = await sb.from("signature_requests").select("id, envelope_id, status, signed_file_path").in("tenancy_id", tenancyIds);
    for (const g of sigs || []) {
      if (g.envelope_id && ["sent", "delivered"].includes(g.status)) await voidEnvelope(g.envelope_id, "Practice certificate cleared").catch(() => null);
      if (g.envelope_id && g.status === "draft") await import("@/lib/docusign").then(({ ds }) => ds("/folders/recyclebin", { method: "PUT", body: { envelopeIds: [g.envelope_id] } })).catch(() => null);
    }
    const paths = (sigs || []).map((g) => g.signed_file_path).filter((p) => p?.startsWith("practice/"));
    if (paths.length) await sb.storage.from(SIGNED_BUCKET).remove(paths);
    const sigIds = (sigs || []).map((g) => g.id);
    if (sigIds.length) {
      await sb.from("staff_tasks").delete().in("signature_request_id", sigIds);
      await sb.from("signature_requests").update({ notice_id: null }).in("id", sigIds);
    }
    await sb.from("notices").delete().in("tenancy_id", tenancyIds);
    if (sigIds.length) {
      await sb.from("signature_requests").delete().in("related_request_id", sigIds);
      await sb.from("signature_requests").delete().in("id", sigIds);
    }
  }
  if (listingIds.length) {
    await sb.from("units").update({ listing_id: null }).in("id", unitIds);
    await sb.from("showing_requests").delete().in("listing_id", listingIds);
    await sb.from("applications").delete().in("listing_id", listingIds); // practice applications (administration+applicant@)
    await sb.from("listings").delete().in("id", listingIds);
  }
  return NextResponse.json({ ok: true });
}
