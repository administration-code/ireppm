import "server-only";
import { buildCertificate, CERT_METHODS, dmy } from "@/lib/docusign-templates";
import { createEnvelope, ds, getRecipients, lockRoleTabs, removeEmptyRecipients, resolveTemplates, sendDraftEnvelope } from "@/lib/docusign";
import { alertStaff, SIGNED_BUCKET } from "@/lib/signatures-server";
import { DEFAULT_DELIVERER } from "@/lib/lease-defaults";
import { SITE } from "@/lib/site";

// Chuck serves N4, N5 and N1 notices from the Agent Portal: once the landlord signs, it's on his list; he
// marks it delivered with the date and how; the portal records the service, fills the date and method into
// the Certificate of Service prepared with the notice (or makes one), and sends it to him to sign.

export const SERVE_DAYS = 2; // serve within 2 days of the landlord signing
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const FORMS = ["N4", "N5", "N1"];
const torontoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export const isServer = (partner) => String(partner?.email || "").trim().toLowerCase() === DEFAULT_DELIVERER.email.toLowerCase();

function placeOf(t) {
  const u = t?.unit;
  return [u?.property?.address, u?.label && !/^whole/i.test(u.label) ? u.label : ""].filter(Boolean).join(", ");
}

// The earliest termination (or increase) date the notice allows when served on `servedOn` by `method`.
// N4: 7 days after service (since Sept 21, 2026); N1: 90 days. Mail adds 5 days. N5 isn't checked here.
export function earliestDate(form, servedOn, method) {
  const days = form === "N4" ? 7 : form === "N1" ? 90 : null;
  if (days == null) return null;
  return addDays(servedOn, days + (method === "mail" ? 5 : 0));
}

// Notices to serve (signed, not yet served) and certificates waiting for Chuck's signature.
export async function serveBoard(sb) {
  const since = new Date(Date.now() - 120 * 86400000).toISOString();
  let { data: notices } = await sb
    .from("signature_requests")
    .select("id, kind, title, terms, prefill, completed_at, signed_file_path, tenancy_id")
    .in("kind", FORMS)
    .eq("status", "completed")
    .is("notice_id", null)
    .gte("completed_at", since)
    .order("completed_at");
  // Already handled the old way: a certificate with the service date was sent or signed.
  const { data: handled } = (notices || []).length
    ? await sb.from("signature_requests").select("related_request_id").eq("kind", "certificate_of_service").in("status", ["sent", "delivered", "completed"]).in("related_request_id", notices.map((n) => n.id))
    : { data: [] };
  const done = new Set((handled || []).map((h) => h.related_request_id));
  notices = (notices || []).filter((n) => !done.has(n.id));
  const ids = [...new Set((notices || []).map((n) => n.tenancy_id).filter(Boolean))];
  const { data: ten } = ids.length
    ? await sb.from("tenancies").select("id, tenancy_tenants(full_name, is_primary, phone), unit:units(label, property:properties(address, city))").in("id", ids)
    : { data: [] };
  const byId = new Map((ten || []).map((t) => [t.id, t]));
  const today = torontoToday();
  const toServe = (notices || []).map((n) => {
    const t = byId.get(n.tenancy_id);
    const people = (t?.tenancy_tenants || []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    const signed = String(n.completed_at).slice(0, 10);
    const due = addDays(signed, SERVE_DAYS);
    const f = n.prefill || {};
    return {
      id: n.id,
      form: n.kind,
      place: placeOf(t) || n.title.replace(/^[^:]*:\s*/, ""),
      city: t?.unit?.property?.city || "",
      tenants: people.map((p) => ({ name: p.full_name, phone: p.phone || null })),
      amount: n.kind === "N4" ? f.amount_owing || (n.terms?.amount ? Number(n.terms.amount) / 100 : null) : null,
      termination: n.terms?.effective_date || f.termination_date || f.increase_date || null,
      signed_on: signed,
      serve_by: due,
      late: today > due,
      has_pdf: Boolean(n.signed_file_path),
    };
  });
  const { data: certs } = await sb
    .from("signature_requests")
    .select("id, title, status, sent_at, terms")
    .eq("kind", "certificate_of_service")
    .in("status", ["sent", "delivered"])
    .order("sent_at");
  return {
    toServe,
    toSign: (certs || []).map((c) => ({ id: c.id, title: c.title, sent_on: String(c.sent_at || "").slice(0, 10), served_on: c.terms?.served_on || null })),
  };
}

export async function signedPdfUrl(sb, id) {
  const { data: n } = await sb.from("signature_requests").select("kind, signed_file_path, status").eq("id", id).maybeSingle();
  if (!n || !FORMS.includes(n.kind) || n.status !== "completed" || !n.signed_file_path) return null;
  const { data } = await sb.storage.from(SIGNED_BUCKET).createSignedUrl(n.signed_file_path, 600);
  return data?.signedUrl || null;
}

// Fill the date served and the method into a draft certificate's fields, by their labels.
async function fillDraft(envelopeId, text, checks) {
  const data = await getRecipients(envelopeId, true);
  const signer = (data?.signers || []).find((r) => r.roleName === "Delivery By") || (data?.signers || [])[0];
  if (!signer) throw new Error("The certificate has no signer.");
  const textTabs = (signer.tabs?.textTabs || []).filter((t) => t.tabLabel in text).map((t) => ({ tabId: t.tabId, value: text[t.tabLabel] }));
  const checkboxTabs = (signer.tabs?.checkboxTabs || []).filter((t) => checks.includes(t.tabLabel)).map((t) => ({ tabId: t.tabId, selected: "true" }));
  if (!checkboxTabs.length) throw new Error("The method box wasn't found on the certificate.");
  await ds(`/envelopes/${envelopeId}/recipients/${signer.recipientId}/tabs`, { method: "PUT", body: { textTabs, checkboxTabs } });
}

export async function markDelivered(sb, partner, input) {
  const id = String(input?.id || "");
  const served = String(input?.served_on || "");
  const methodKey = CERT_METHODS[input?.method] ? input.method : "";
  const details = String(input?.details || "").trim().slice(0, 200);
  const today = torontoToday();
  if (!ISO.test(served)) return { error: "Choose the date you delivered it." };
  if (served > today) return { error: "The date can't be in the future." };
  if (!methodKey) return { error: "Choose how you delivered it." };
  if (methodKey === "other" && details.length < 3) return { error: "Type how you delivered it." };
  if (methodKey === "fax" && !/\d{7,}/.test(String(input?.fax_number || "").replace(/\D/g, ""))) return { error: "Type the fax number you sent it to." };

  const { data: n } = await sb.from("signature_requests").select("*").eq("id", id).maybeSingle();
  if (!n || !FORMS.includes(n.kind) || n.status !== "completed") return { error: "That notice wasn't found, or it isn't signed yet." };
  if (n.notice_id) return { error: "That notice is already marked delivered." };
  const { data: already } = await sb.from("signature_requests").select("id").eq("kind", "certificate_of_service").eq("related_request_id", n.id).in("status", ["sent", "delivered", "completed"]).limit(1);
  if (already?.length) return { error: "A Certificate of Service was already sent for this notice. Ask Rosie." };
  if (served < String(n.completed_at).slice(0, 10)) return { error: "The date is before the landlord signed it." };
  const method = CERT_METHODS[methodKey];

  // 1. Record the service on the tenancy.
  const servedBy = DEFAULT_DELIVERER.name;
  const { data: noticeId, error: recErr } = await sb.rpc("record_notice_service", { p_request_id: n.id, p_served_on: served, p_method: method.notice, p_served_by: servedBy });
  if (recErr) return { error: "That didn't save. Try again, or tell Rosie." };
  const how = methodKey === "other" ? details : method.label;
  await sb.from("notices").update({ notes: [n.terms?.notes, `Served by Chuck (Agent Portal): ${how}.`].filter(Boolean).join(" ") }).eq("id", noticeId);

  // 2. The tenancy's address and tenants, for the certificate.
  const { data: t } = n.tenancy_id
    ? await sb.from("tenancies").select("id, unit:units(id, label, property:properties(id, address, city, postal_code)), tenancy_tenants(full_name, is_primary)").eq("id", n.tenancy_id).maybeSingle()
    : { data: null };
  const property = t?.unit?.property;
  const mailAddress = String(input?.mail_address || "").trim() || [property?.address, t?.unit?.label && !/^whole/i.test(t.unit.label) ? t.unit.label : "", property?.city, property?.postal_code].filter(Boolean).join(", ");
  const cf = {
    related_request_id: n.id,
    tenancy_id: n.tenancy_id,
    unit_id: n.unit_id || t?.unit?.id || null,
    property_id: n.property_id || property?.id || null,
    owner_id: n.owner_id || null,
    notice_form: n.kind,
    street_address: property?.address || "",
    unit_label: t?.unit?.label || "",
    city: property?.city || "",
    postal_code: property?.postal_code || "",
    served_to: (t?.tenancy_tenants || []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((x) => x.full_name).filter(Boolean),
    deliverer_name: DEFAULT_DELIVERER.name,
    deliverer_email: DEFAULT_DELIVERER.email,
    deliverer_phone: SITE.emergency.phone,
    served_by_name: servedBy,
    date_served: served,
    method: methodKey,
    method_details: details,
    mail_address: mailAddress,
    fax_number: String(input?.fax_number || "").trim(),
  };

  // 3. The certificate: fill the one prepared with the notice, or make one. Then send it to Chuck to sign.
  let certId = null;
  let certError = null;
  try {
    const ids = await resolveTemplates(["certificate_of_service"]);
    const built = buildCertificate(cf, ids);
    const terms = { served_on: served, method: methodKey, notice_form: n.kind, method_details: details || undefined, marked_by: "chuck" };
    const { data: drafts } = await sb
      .from("signature_requests")
      .select("id, envelope_id, status, terms")
      .eq("kind", "certificate_of_service")
      .eq("related_request_id", n.id)
      .eq("status", "draft")
      .not("envelope_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const draft = drafts?.[0];
    const now = new Date().toISOString();
    if (draft) {
      const text = {
        "Date Served": dmy(served),
        "Other Method Details": methodKey === "other" ? details : "",
        "Mail Address": methodKey === "mail" ? mailAddress : "",
        "Fax Number": methodKey === "fax" ? cf.fax_number : "",
      };
      await fillDraft(draft.envelope_id, text, [method.tab]);
      await lockRoleTabs(draft.envelope_id, /^Delivery By$/).catch(() => 0);
      await sendDraftEnvelope(draft.envelope_id);
      await sb.from("signature_requests").update({ status: "sent", sent_at: now, status_changed_at: now, prefill: built.prefill, terms, error: null }).eq("id", draft.id);
      certId = draft.id;
    } else {
      if (!ids.certificate_of_service) throw new Error("DocuSign template not found: certificate_of_service.");
      const place = placeOf(t) || n.title.replace(/^[^:]*:\s*/, "");
      const title = `Certificate of Service (${n.kind}): ${place}`;
      const { data: row, error } = await sb
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
          related_request_id: n.id,
          recipients: built.recipients,
          prefill: built.prefill,
          terms,
          email_subject: `Please sign: ${title}`.slice(0, 100),
          sent_by: n.sent_by,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      certId = row.id;
      const env = await createEnvelope({ ...built.definition, emailSubject: `Please sign: ${title}`.slice(0, 100), status: "created" });
      await removeEmptyRecipients(env.envelopeId);
      await lockRoleTabs(env.envelopeId, /^Delivery By$/).catch(() => 0);
      await sendDraftEnvelope(env.envelopeId);
      await sb.from("signature_requests").update({ envelope_id: env.envelopeId, status: "sent", sent_at: now, status_changed_at: now, error: null }).eq("id", row.id);
    }
  } catch (err) {
    certError = String(err?.message || err);
    console.error("[serve] certificate failed:", certError);
    if (certId) await sb.from("signature_requests").update({ status: "error", error: certError }).eq("id", certId);
  }

  // 4. Check the dates and tell staff.
  const termination = n.terms?.effective_date || n.prefill?.termination_date || n.prefill?.increase_date || null;
  const earliest = earliestDate(n.kind, served, method.notice);
  const tooEarly = Boolean(termination && earliest && termination < earliest);
  const place = placeOf(t) || n.title;
  const lines = [
    `Chuck marked the ${n.kind} for ${place} delivered on ${served}: ${how}.`,
    tooEarly
      ? `WARNING: the ${n.kind === "N1" ? "increase" : "termination"} date on the notice (${termination}) is before ${earliest}, the earliest it can be when served this way on ${served}. The notice likely needs to be redone and served again.`
      : termination && earliest
        ? `The ${n.kind === "N1" ? "increase" : "termination"} date (${termination}) works with this service date.`
        : n.kind === "N5"
          ? "Check the N5 termination date against the service date."
          : "",
    methodKey === "other" ? `Check this method is acceptable for the Board: "${details}".` : "",
    certError ? `The Certificate of Service could NOT be sent to Chuck (${certError}). Send it from the notice page.` : "The Certificate of Service, filled in, was sent to Chuck to sign.",
  ].filter(Boolean);
  await alertStaff(`${tooEarly ? "Check dates: " : ""}${n.kind} delivered: ${place}`, lines, n.id);
  return { ok: true, certificate: !certError, tooEarly, earliest };
}
