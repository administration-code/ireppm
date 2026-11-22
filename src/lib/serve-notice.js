import "server-only";
import { buildCertificate, CERT_METHODS, dmy } from "@/lib/docusign-templates";
import { createEnvelope, ds, getRecipients, lockRoleTabs, removeEmptyRecipients, resolveTemplates, sendDraftEnvelope } from "@/lib/docusign";
import { alertStaff, SIGNED_BUCKET } from "@/lib/signatures-server";
import { DEFAULT_DELIVERER } from "@/lib/lease-defaults";
import { SITE } from "@/lib/site";
import { mailer, mailConfigured } from "@/lib/mailer";
import { escapeHtml, renderEmail, renderText } from "@/lib/staff-alerts";

// Email service from the office is Rishi's job: he serves it, so he signs the certificate.
export const EMAIL_SERVER_EMAIL = "rishi@ireppm.ca";
const EMBED_ID = "irep-staff-serve";

// Chuck serves N4, N5 and N1 notices from the Agent Portal: once the landlord signs, it's on his list; he
// marks it delivered with the date and how; the portal records the service, fills the date and method into
// the Certificate of Service prepared with the notice (or makes one), and sends it to him to sign.

export const SERVE_DAYS = 2; // serve within 2 days of the landlord signing
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const FORMS = ["N4", "N5", "N1"];
const torontoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Can this tenancy's notice be served by email? Only with written consent to email service on file and a valid
// email for every tenant named on the tenancy. Otherwise Chuck serves it on paper.
export async function emailEligibility(sb, tenancyId) {
  if (!tenancyId) return { ok: false, reason: "No tenancy on the notice." };
  const { data: t } = await sb.from("tenancies").select("email_service_ok, email_service_consent, tenancy_tenants(full_name, email)").eq("id", tenancyId).maybeSingle();
  if (!t?.email_service_ok) return { ok: false, reason: `No written consent to email service (${t?.email_service_consent || "none recorded"}).` };
  // A box IRep's old lease template ticked in advance isn't the tenant's own choice: those are served on paper.
  if (/pre-?checked/i.test(t.email_service_consent || "")) return { ok: false, reason: "The only consent is a box pre-checked on IRep's old lease template." };
  const people = t.tenancy_tenants || [];
  const missing = people.filter((p) => !EMAIL.test(String(p.email || "").trim())).map((p) => p.full_name || "a tenant");
  if (!people.length || missing.length) return { ok: false, reason: `No valid email for ${missing.join(", ") || "the tenants"}.` };
  return { ok: true, emails: [...new Set(people.map((p) => p.email.trim().toLowerCase()))], names: people.map((p) => p.full_name).filter(Boolean) };
}

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
  // Tenants who consented to email service get it by email from the office, not from Chuck.
  const elig = await Promise.all(notices.map((n) => emailEligibility(sb, n.tenancy_id)));
  notices = notices.filter((n, i) => !elig[i].ok);
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
    .select("id, title, status, sent_at, terms, recipients")
    .eq("kind", "certificate_of_service")
    .in("status", ["sent", "delivered"])
    .order("sent_at");
  // Chuck's certificates: sent to chuck@ireppm.ca, or to his business Gmail before Nov 21.
  const CHUCK = [DEFAULT_DELIVERER.email.toLowerCase(), "chuckfixedmyhouse@gmail.com"];
  const mine = (certs || []).filter((c) => (c.recipients || []).some((r) => CHUCK.includes(String(r.email || "").toLowerCase())));
  return {
    toServe,
    toSign: mine.map((c) => ({ id: c.id, title: c.title, sent_on: String(c.sent_at || "").slice(0, 10), served_on: c.terms?.served_on || null })),
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

// Serve a signed N4, N5 or N1 by email (tenants who consented in writing), record it, and send the Certificate of
// Service to the staff member who sent it, to sign. The blank certificate prepared for Chuck is discarded.
// `server` = the staff member who clicks Email It: they served it, so they sign the certificate under their own name.
export async function emailServe(sb, requestId, server) {
  if (!server?.name || server.name.trim().split(/\s+/).length < 2 || /^administration$/i.test(server.name.trim())) return { error: "Type your full name: you sign the Certificate of Service." };
  if (!EMAIL.test(String(server.email || ""))) return { error: "Your account has no email for DocuSign." };
  if (!mailConfigured()) return { error: "Email isn't set up." };
  const { data: row } = await sb.from("signature_requests").select("*").eq("id", requestId).maybeSingle();
  if (!row || !FORMS.includes(row.kind)) return { error: "Not found." };
  if (row.status !== "completed" || !row.signed_file_path) return { error: "It isn't signed yet." };
  if (row.notice_id) return { error: "This notice has already been served." };
  const elig = await emailEligibility(sb, row.tenancy_id);
  if (!elig.ok) return { error: `${elig.reason} Chuck serves this one on paper.` };

  const { data: t } = await sb
    .from("tenancies")
    .select("id, unit:units(id, label, property:properties(id, address, city, postal_code)), tenancy_tenants(full_name, is_primary)")
    .eq("id", row.tenancy_id)
    .maybeSingle();
  const property = t?.unit?.property;
  const place = placeOf(t) || row.title.replace(/^[^:]*:\s*/, "");
  const { data: file, error: dlError } = await sb.storage.from(SIGNED_BUCKET).download(row.signed_file_path);
  if (dlError) return { error: `Couldn't load the signed PDF: ${dlError.message}` };
  const pdf = Buffer.from(await file.arrayBuffer());

  const FORM_NAME = { N1: "N1 Notice of Rent Increase", N4: "N4 Notice to End your Tenancy for Non-payment of Rent", N5: "N5 Notice to End your Tenancy" };
  const lines = [
    `Dear ${elig.names.join(", ") || "tenant"},`,
    `Attached is your ${FORM_NAME[row.kind]} for ${place}. It is served on you by email because you agreed in writing to receive notices and documents by email.`,
    `If you have questions about this notice, contact ${SITE.emergency.name} (${DEFAULT_DELIVERER.name}) at ${SITE.emergency.phone}, or email ${SITE.email}.`,
    `${SITE.name}\n${SITE.phone}`,
  ];
  const { error: sendError } = await mailer().emails.send({
    from: `${SITE.name} <${SITE.email}>`,
    to: elig.emails,
    cc: [SITE.email],
    replyTo: SITE.email,
    subject: `${row.kind} notice for ${place}`,
    text: lines.join("\n\n"),
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#161616">${lines.map((l) => `<p style="margin:0 0 12px">${escapeHtml(l).replace(/\n/g, "<br>")}</p>`).join("")}</div>`,
    attachments: [{ filename: `${row.kind} ${place}.pdf`.replace(/[^\w\- .]+/g, ""), content: pdf.toString("base64") }],
  });
  if (sendError) return { error: `Email failed: ${sendError.message}` };

  const today = torontoToday();
  const { data: noticeId, error: rpcError } = await sb.rpc("record_notice_service", { p_request_id: row.id, p_served_on: today, p_method: "email", p_served_by: server.name.trim() });
  if (rpcError) return { error: `Emailed, but couldn't record the service: ${rpcError.message}` };
  const how = `By email to ${elig.emails.join(", ")} (written consent to email service on file)`;
  await sb.from("notices").update({ notes: [row.terms?.notes, `Served by email from the office: ${elig.emails.join(", ")}.`].filter(Boolean).join(" ") }).eq("id", noticeId);

  // The blank certificate prepared for Chuck isn't needed: discard it.
  const { data: drafts } = await sb.from("signature_requests").select("id, envelope_id").eq("kind", "certificate_of_service").eq("related_request_id", row.id).eq("status", "draft");
  for (const d of drafts || []) {
    if (d.envelope_id) await ds("/folders/recyclebin", { method: "PUT", body: { envelopeIds: [d.envelope_id] } }).catch((err) => console.error("[serve] draft not discarded:", err?.message || err));
    await sb.from("signature_requests").update({ status: "voided", void_reason: "Served by email from the office instead.", status_changed_at: new Date().toISOString() }).eq("id", d.id);
  }

  let certificate = false;
  try {
    const ids = await resolveTemplates(["certificate_of_service"]);
    if (!ids.certificate_of_service) throw new Error("DocuSign template not found: certificate_of_service.");
    const cf = {
      related_request_id: row.id,
      notice_form: row.kind,
      street_address: property?.address || "",
      unit_label: t?.unit?.label || "",
      city: property?.city || "",
      postal_code: property?.postal_code || "",
      served_to: (t?.tenancy_tenants || []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((x) => x.full_name).filter(Boolean),
      deliverer_name: server.name.trim(),
      deliverer_email: server.email.trim().toLowerCase(),
      deliverer_phone: SITE.phone,
      served_by_name: server.name.trim(),
      date_served: today,
      method: "other",
      method_details: how.slice(0, 200),
    };
    const built = buildCertificate(cf, ids);
    // Signed right in the staff portal (Email Service page), so no DocuSign email is needed.
    built.definition.templateRoles[0].clientUserId = EMBED_ID;
    const title = `Certificate of Service (${row.kind}): ${place}`;
    const { data: c, error } = await sb
      .from("signature_requests")
      .insert({
        kind: "certificate_of_service",
        title,
        template_id: ids.certificate_of_service,
        status: "draft",
        tenancy_id: row.tenancy_id,
        unit_id: row.unit_id || t?.unit?.id || null,
        property_id: row.property_id || property?.id || null,
        owner_id: row.owner_id || null,
        related_request_id: row.id,
        recipients: built.recipients,
        prefill: built.prefill,
        terms: { served_on: today, method: "email", notice_form: row.kind, method_details: how, embedded: true },
        email_subject: `Please sign: ${title}`.slice(0, 100),
        sent_by: row.sent_by,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const env = await createEnvelope({ ...built.definition, emailSubject: `Please sign: ${title}`.slice(0, 100), status: "created" });
    await removeEmptyRecipients(env.envelopeId);
    await lockRoleTabs(env.envelopeId, /^Delivery By$/).catch(() => 0);
    await sendDraftEnvelope(env.envelopeId);
    const now = new Date().toISOString();
    await sb.from("signature_requests").update({ envelope_id: env.envelopeId, status: "sent", sent_at: now, status_changed_at: now, error: null }).eq("id", c.id);
    certificate = true;
  } catch (err) {
    console.error("[serve] email certificate failed:", err?.message || err);
  }
  await sb.from("staff_tasks").update({ status: "done", done_at: new Date().toISOString() }).eq("link", `/admin/signatures/${row.id}`).in("status", ["open", "waiting"]);
  return { ok: true, notice_id: noticeId, sent_to: elig.emails, certificate };
}

// A task for Rishi when a notice can be served by email: he opens it, clicks Email It to the Tenants, and signs.
export async function emailServeTask(sb, row) {
  try {
    const { data: rishi } = await sb.from("profiles").select("id, full_name, email, role").eq("email", EMAIL_SERVER_EMAIL).maybeSingle();
    const link = `/admin/signatures/${row.id}`;
    const { data: existing } = await sb.from("staff_tasks").select("id").eq("link", link).in("status", ["open", "waiting"]).limit(1);
    if (existing?.length) return;
    const due = addDays(torontoToday(), 1);
    const title = `Serve by email: ${row.title}`.slice(0, 200);
    await sb.from("staff_tasks").insert({
      kind: "follow_up",
      title,
      detail: "The tenants consented in writing to email service. Open Email Service, click Email It to the Tenants, then Review and Sign the Certificate of Service on the same page.",
      status: "open",
      due_date: due,
      tenancy_id: row.tenancy_id,
      unit_id: row.unit_id,
      property_id: row.property_id,
      signature_request_id: row.id,
      link,
      source: "system",
      created_by: null,
      ...(rishi && ["staff", "admin"].includes(rishi.role) ? { assigned_to: rishi.id, assigned_at: new Date().toISOString() } : {}),
    });
    if (rishi?.email && mailConfigured()) {
      const rows = [["Task", title], ["Due", due]];
      const href = { href: "https://ireppm.ca/admin/serving", label: "Open Email Service" };
      await mailer().emails.send({
        from: "IRep Property Management <alerts@ireppm.ca>",
        to: [rishi.email],
        replyTo: SITE.email,
        subject: `New task for you: ${title}`.slice(0, 150),
        html: renderEmail({ heading: "Serve by Email", intro: `Hi ${String(rishi.full_name || "").split(" ")[0] || "there"}, a signed ${row.kind} is ready to serve by email.`, rows, link: href }),
        text: renderText({ heading: "Serve by Email", rows, link: href }),
      });
    }
  } catch (err) {
    console.error("[serve] email task failed:", err?.message || err);
  }
}

// Staff Email Service page: notices ready to email, and certificates waiting for this staff member to sign.
export async function servingBoard(sb, staff) {
  const since = new Date(Date.now() - 120 * 86400000).toISOString();
  const { data: notices } = await sb
    .from("signature_requests")
    .select("id, kind, title, completed_at, tenancy_id, terms, prefill")
    .in("kind", FORMS)
    .eq("status", "completed")
    .is("notice_id", null)
    .gte("completed_at", since)
    .order("completed_at");
  const list = notices || [];
  const { data: handled } = list.length
    ? await sb.from("signature_requests").select("related_request_id").eq("kind", "certificate_of_service").in("status", ["sent", "delivered", "completed"]).in("related_request_id", list.map((n) => n.id))
    : { data: [] };
  const done = new Set((handled || []).map((h) => h.related_request_id));
  const open = list.filter((n) => !done.has(n.id));
  const elig = await Promise.all(open.map((n) => emailEligibility(sb, n.tenancy_id)));
  const toSend = open
    .map((n, i) => ({ n, e: elig[i] }))
    .filter((x) => x.e.ok)
    .map(({ n, e }) => ({
      id: n.id,
      form: n.kind,
      title: n.title,
      signed_on: String(n.completed_at).slice(0, 10),
      emails: e.emails,
      termination: n.terms?.effective_date || n.prefill?.termination_date || n.prefill?.increase_date || null,
    }));
  const me = String(staff?.email || "").toLowerCase();
  const { data: certs } = await sb
    .from("signature_requests")
    .select("id, title, sent_at, terms, recipients, related_request_id")
    .eq("kind", "certificate_of_service")
    .in("status", ["sent", "delivered"])
    .order("sent_at");
  const toSign = (certs || [])
    .filter((c) => (c.recipients || []).some((r) => String(r.email || "").toLowerCase() === me))
    .map((c) => ({ id: c.id, title: c.title, sent_on: String(c.sent_at || "").slice(0, 10), served_on: c.terms?.served_on || null, embedded: Boolean(c.terms?.embedded) }));
  return { toSend, toSign };
}

// A DocuSign signing link, inside the portal, for a certificate this staff member signs.
export async function certificateSigningUrl(sb, staff, id, returnUrl) {
  const { data: c } = await sb.from("signature_requests").select("id, kind, status, envelope_id, recipients, terms").eq("id", id).maybeSingle();
  if (!c || c.kind !== "certificate_of_service" || !c.envelope_id) return { error: "Not found." };
  if (!["sent", "delivered"].includes(c.status)) return { error: "That certificate is already signed or closed." };
  const me = String(staff?.email || "").toLowerCase();
  const r = (c.recipients || []).find((x) => String(x.email || "").toLowerCase() === me);
  if (!r) return { error: "This certificate is for someone else to sign." };
  if (!c.terms?.embedded) return { error: "This one was sent by email: open the DocuSign email to sign it." };
  const view = await ds(`/envelopes/${c.envelope_id}/views/recipient`, {
    method: "POST",
    body: { returnUrl, authenticationMethod: "none", email: r.email, userName: r.name, clientUserId: EMBED_ID },
  });
  return { url: view.url };
}
