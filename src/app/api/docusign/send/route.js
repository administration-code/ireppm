import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addTabsByRole, createEnvelope, lockRoleTabs, removeEmptyRecipients, resolveTemplates, sendDraftEnvelope, senderViewUrl } from "@/lib/docusign";
import { staffUser } from "@/lib/signatures-server";
import { DEFAULT_DELIVERER } from "@/lib/lease-defaults";
import { SITE } from "@/lib/site";
import { fillLeaseSchedule, pmLeaseRows } from "@/lib/pm-lease-schedule";
import {
  KIND_TEMPLATES,
  buildCertificate,
  buildConsent,
  buildLease,
  buildNForm,
  buildPmContract,
} from "@/lib/docusign-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());

function validate(kind, f) {
  if (kind === "lease") {
    const tenants = f.tenants || [];
    if (!f.unit_id) return "Choose the unit.";
    if (!tenants.length) return "Add at least one tenant.";
    if (tenants.some((t) => !str(t.full_name) || !EMAIL.test(str(t.email)))) return "Every tenant needs a name and an email.";
    if (!f.start_date) return "Add the start date.";
    if (f.term !== "monthly" && !f.end_date) return "Add the end date, or choose month-to-month.";
    if (!(Number(f.base_rent) > 0)) return "Add the rent.";
    if (str(f.guarantor_name) && !EMAIL.test(str(f.guarantor_email))) return "The guarantor needs an email.";
  }
  if (kind === "consent" && (!str(f.tenant_name) || !EMAIL.test(str(f.tenant_email)))) return "The tenant needs a name and an email.";
  if (kind === "pm_contract") {
    const owners = (f.owners || []).filter((o) => str(o.name) || str(o.email));
    if (!owners.length) return "Add at least one owner signer.";
    if (owners.some((o) => !str(o.name) || !EMAIL.test(str(o.email)))) return "Every owner signer needs a name and an email.";
    const c = f.contract || {};
    if (!c.effective_date || !c.commencement_date) return "Add the effective date and the commencement date.";
    if (!str(c.property_address)) return "Add the property address.";
    if (!str(c.notice_address)) return "Add the landlord's address for notices.";
    if (c.engagement === "resign" && !c.managed_since) return "Add the date we started managing the property (re-signing).";
  }
  if (kind === "N1" && (!f.increase_date || !(Number(f.new_rent) > 0))) return "Add the increase date and the new rent.";
  if (kind === "N4" && (!f.termination_date || !(Number(f.amount_owing) > 0))) return "Add the termination date and the amount owing.";
  if (kind === "N5") {
    if (!f.termination_date) return "Add the termination date.";
    if (!(f.reasons || []).length) return "Choose at least one reason.";
  }

  if (kind === "certificate_of_service") {
    if (!f.related_request_id) return "Missing the notice this certificate is for.";
    if (!str(f.deliverer_name) || !EMAIL.test(str(f.deliverer_email))) return "Add the name and email of the person who delivered it.";
    if (!f.date_served) return "Add the date served.";
  }
  return null;
}

function titleFor(kind, f) {
  const place = str(f.place);
  if (kind === "lease") return `Lease: ${place}`;
  if (kind === "consent") return `Consent to Service by Email: ${str(f.tenant_name)}`;
  if (kind === "pm_contract") return `Management contract: ${place}`;
  if (kind === "certificate_of_service") return `Certificate of Service (${f.notice_form}): ${place}`;
  return `${kind}: ${place}`;
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const staff = await staffUser(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const kind = body?.kind;
  const mode = body?.mode === "send" ? "send" : "review";
  const f = body?.form || {};
  if (!KIND_TEMPLATES[kind]) return NextResponse.json({ error: "Unknown document type." }, { status: 400 });
  if (kind === "N9" || kind === "N11") {
    return NextResponse.json({ error: "Tenants start an N9 or N11 from their tenant portal." }, { status: 400 });
  }

  const problem = validate(kind, f);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  let ids;
  try {
    ids = await resolveTemplates(KIND_TEMPLATES[kind]);
  } catch (err) {
    return NextResponse.json({ error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
  const missing = KIND_TEMPLATES[kind].filter((k) => !ids[k]);
  if (missing.length) {
    return NextResponse.json({ error: `DocuSign template not found: ${missing.join(", ")}.` }, { status: 400 });
  }

  let owner = null;
  if (f.owner_id) {
    const { data } = await sb.from("owners").select("id, name, email, phone").eq("id", f.owner_id).maybeSingle();
    owner = data;
  }

  // The landlord signs leases, consent forms and N-forms; IRep never signs for them.
  if (["lease", "consent", "N1", "N4", "N5"].includes(kind)) {
    const email = str(f.signer?.email) || str(owner?.email);
    if (!EMAIL.test(email)) {
      return NextResponse.json(
        { error: "The landlord signs this, so they need an email. Add it on the owner's page, or type the signer's email." },
        { status: 400 }
      );
    }
  }

  let built;
  if (kind === "lease") built = buildLease(f, ids, owner);
  else if (kind === "consent") built = buildConsent(f, ids, owner);
  else if (kind === "pm_contract") {
    const { data: addons } = f.property_id
      ? await sb.from("property_addons").select("addon_key").eq("property_id", f.property_id)
      : { data: [] };
    built = buildPmContract({ ...f, addons: (addons || []).map((a) => a.addon_key) }, ids);
  }
  else if (kind === "certificate_of_service") built = buildCertificate(f, ids);
  else built = buildNForm(kind, f, ids, owner);

  const title = titleFor(kind, f);
  const emailSubject = (str(f.email_subject) || `Please sign: ${title}`).slice(0, 100);
  const templateId = KIND_TEMPLATES[kind].map((k) => ids[k]).join(",");

  const { data: row, error: insertError } = await sb
    .from("signature_requests")
    .insert({
      kind: kind === "consent" ? "other" : kind,
      title,
      template_id: templateId,
      status: "draft",
      application_id: f.application_id || null,
      tenancy_id: f.tenancy_id || null,
      unit_id: f.unit_id || null,
      property_id: f.property_id || null,
      owner_id: f.owner_id || null,
      related_request_id: f.related_request_id || null,
      recipients: built.recipients,
      prefill: built.prefill,
      terms: built.terms,
      email_subject: emailSubject,
      sent_by: staff.id,
    })
    .select("id")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    // Always start as a draft, drop the blank template roles (unused tenants, no guarantor),
    // then send it or open it for review.
    const env = await createEnvelope({ ...built.definition, emailSubject, status: "created" });
    await removeEmptyRecipients(env.envelopeId);
    // The landlord only signs these: every field on their side was filled by IRep, so lock it all.
    // Leasing-only leases: the landlord fills in their own notice address, so their fields stay editable.
    if (["lease", "consent", "N1", "N4", "N5", "certificate_of_service"].includes(kind) && !(kind === "lease" && f.leasing_only)) {
      await lockRoleTabs(env.envelopeId, /^(Landlord|Delivery By)$/).catch(() => 0);
    }
    // Management contracts: initials, boxes, phones and the contract's details (dates, addresses, fees)
    // are added straight away, anchored to the contract's own words and hidden markers.
    if (built.extraTabs) await addTabsByRole(env.envelopeId, built.extraTabs);
    // Lease schedule (Schedule A, Part 5) from the property's current tenancies.
    if (kind === "pm_contract" && f.contract?.fill_leases !== false) {
      await fillLeaseSchedule(env.envelopeId, await pmLeaseRows(sb, f.property_id));
    }
    if (mode === "send") await sendDraftEnvelope(env.envelopeId);
    const now = new Date().toISOString();
    await sb
      .from("signature_requests")
      .update({
        envelope_id: env.envelopeId,
        status: mode === "send" ? "sent" : "draft",
        sent_at: mode === "send" ? now : null,
        status_changed_at: now,
        error: null,
      })
      .eq("id", row.id);

    // N4, N5: draft the Certificate of Service for Chuck at the same time (left as a draft for staff).
    let certificate = null;
    if (["N4", "N5"].includes(kind)) certificate = await draftCertificate(sb, kind, f, row.id, title, staff.id);

    let url = null;
    if (mode === "review") {
      const origin = new URL(request.url).origin;
      url = await senderViewUrl(env.envelopeId, `${origin}/admin/signatures/${row.id}`);
    }
    return NextResponse.json({ id: row.id, url, certificate });
  } catch (err) {
    await sb
      .from("signature_requests")
      .update({ status: "error", error: err.message, status_changed_at: new Date().toISOString() })
      .eq("id", row.id);
    return NextResponse.json({ id: row.id, error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
}

// The Certificate of Service for a notice Chuck will serve, prepared with the notice: the unit's
// address and the tenants filled in, date served and method left blank for Chuck, signed as the
// landlord's representative, his phone number. Never sent from here. Returns its id, or null.
async function draftCertificate(sb, kind, f, noticeId, noticeTitle, staffId) {
  let row = null;
  try {
    const ids = await resolveTemplates(["certificate_of_service"]);
    if (!ids.certificate_of_service) throw new Error("DocuSign template not found: certificate_of_service.");
    let tenancy = null;
    if (f.tenancy_id) {
      const { data } = await sb
        .from("tenancies")
        .select("id, unit:units(id, label, property:properties(id, address, city, postal_code)), tenancy_tenants(full_name, is_primary, created_at)")
        .eq("id", f.tenancy_id)
        .maybeSingle();
      tenancy = data;
    }
    const property = tenancy?.unit?.property;
    const tenants = (tenancy?.tenancy_tenants || [])
      .slice()
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((t) => t.full_name)
      .filter(Boolean);
    const cf = {
      related_request_id: noticeId,
      tenancy_id: f.tenancy_id || null,
      unit_id: f.unit_id || tenancy?.unit?.id || null,
      property_id: f.property_id || property?.id || null,
      owner_id: f.owner_id || null,
      notice_form: kind,
      street_address: property?.address || [f.street_number, f.street_name].filter(Boolean).join(" "),
      unit_label: tenancy?.unit?.label || f.unit_label || "",
      city: property?.city || f.city || "",
      postal_code: property?.postal_code || f.postal_code || "",
      served_to: tenants.length ? tenants : String(f.tenant_names || "").split(/,\s*|\s+and\s+/).filter(Boolean),
      deliverer_name: DEFAULT_DELIVERER.name,
      deliverer_email: DEFAULT_DELIVERER.email,
      deliverer_phone: SITE.emergency.phone,
      served_by_name: DEFAULT_DELIVERER.name,
      blank_service: true,
    };
    const built = buildCertificate(cf, ids);
    const place = noticeTitle.replace(/^[^:]*:\s*/, "");
    const title = `Certificate of Service (${kind}): ${place}`;
    const { data: inserted, error } = await sb
      .from("signature_requests")
      .insert({
        kind: "certificate_of_service",
        title,
        template_id: ids.certificate_of_service,
        status: "draft",
        tenancy_id: cf.tenancy_id,
        unit_id: cf.unit_id,
        property_id: cf.property_id,
        owner_id: cf.owner_id,
        related_request_id: noticeId,
        recipients: built.recipients,
        prefill: built.prefill,
        terms: built.terms,
        email_subject: `Please complete and sign: ${title}`.slice(0, 100),
        sent_by: staffId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    row = inserted;
    // Chuck fills in the date served and the method, so his fields stay editable (not locked).
    const env = await createEnvelope({ ...built.definition, emailSubject: `Please complete and sign: ${title}`.slice(0, 100), status: "created" });
    await removeEmptyRecipients(env.envelopeId);
    await sb
      .from("signature_requests")
      .update({ envelope_id: env.envelopeId, status: "draft", status_changed_at: new Date().toISOString(), error: null })
      .eq("id", row.id);
    return row.id;
  } catch (err) {
    console.error("[docusign] certificate draft failed:", err?.message || err);
    if (row?.id) await sb.from("signature_requests").update({ status: "error", error: err.message }).eq("id", row.id);
    return null;
  }
}
