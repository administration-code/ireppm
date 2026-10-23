import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addTabsByRole, ds, isConfigured, removeEmptyRecipients, resolveTemplateId, templateRecipients } from "@/lib/docusign";
import { EXPECTED, TEMPLATES, pmContractTabs } from "@/lib/docusign-templates";
import { staffUser } from "@/lib/signatures-server";
import { fillLeaseSchedule, pmLeaseRows } from "@/lib/pm-lease-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CALIB_PDF = "JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1BhcmVudCA2IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgNiAwIFIgL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL0F1dGhvciAoYW5vbnltb3VzKSAvQ3JlYXRpb25EYXRlIChEOjIwMjYxMDIzMTUyNTUyLTA0JzAwJykgL0NyZWF0b3IgKGFub255bW91cykgL0tleXdvcmRzICgpIC9Nb2REYXRlIChEOjIwMjYxMDIzMTUyNTUyLTA0JzAwJykgL1Byb2R1Y2VyIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSBcKG9wZW5zb3VyY2VcKSkgCiAgL1N1YmplY3QgKHVuc3BlY2lmaWVkKSAvVGl0bGUgKHVudGl0bGVkKSAvVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0NvdW50IDEgL0tpZHMgWyAzIDAgUiBdIC9UeXBlIC9QYWdlcwo+PgplbmRvYmoKNyAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAzMzQKPj4Kc3RyZWFtCkdhcld1NClWcWklIlI8bVZyNjNOOEIkP3AtIkRJS2w1JjNLODcuMC9BRWljJmA/SVNeS0U2XnVLaG01S0tYPHBmSiVtVzpgczBrbiNZPDwrIStkUCloVmI1KUBtQl4xW0koLTZtclNfLjpiJzlfXFNmayI6PjoqN14xT3FlSUNoTyJZMD0yIzpbOkZXNFBcQDBabGBzV3MmOmI9UzZHSltxW2ZccEw1TVtuTWxNMVwyPUg9U0xIcyssVyJjO1NlRHNWMVEiLSk2YitVO1pDN2UxYkgpUSxzPCUxMiI6aD9dSF42V0ZhTS8udCFiLT5daGZbalQ3YEdtS1w9c1suaUM2PlxnPilWQkRVcF0+ZVs5RFgsT2stODooMjlsaFdiQWZlZjBaVG5FQG9bREhgK0cycj9sRzA6Pl9bRnBjQDxYI0JwZlg1OSU7V1Yjfj5lbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA4CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMDkyIDAwMDAwIG4gCjAwMDAwMDAxOTkgMDAwMDAgbiAKMDAwMDAwMDM5MiAwMDAwMCBuIAowMDAwMDAwNDYwIDAwMDAwIG4gCjAwMDAwMDA3MjEgMDAwMDAgbiAKMDAwMDAwMDc4MCAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzxjZmYyYjhlY2ZmYmRjM2RiODA2YzY2MjVlZTE4MWRjMT48Y2ZmMmI4ZWNmZmJkYzNkYjgwNmM2NjI1ZWUxODFkYzE+XQolIFJlcG9ydExhYiBnZW5lcmF0ZWQgUERGIGRvY3VtZW50IC0tIGRpZ2VzdCAob3BlbnNvdXJjZSkKCi9JbmZvIDUgMCBSCi9Sb290IDQgMCBSCi9TaXplIDgKPj4Kc3RhcnR4cmVmCjEyMDQKJSVFT0YK";

const TAB_GROUPS = ["textTabs", "checkboxTabs", "radioGroupTabs", "listTabs", "numberTabs", "dateTabs", "signHereTabs", "dateSignedTabs", "fullNameTabs", "initialHereTabs", "emailTabs"];

export async function GET(request) {
  const sb = getSupabaseAdmin();
  if (!(await staffUser(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ error: "DocuSign isn't set up yet." }, { status: 400 });

  try {
    const results = await Promise.all(
      Object.keys(TEMPLATES).map(async (key) => {
        const id = await resolveTemplateId(key);
        if (!id) return { key, names: TEMPLATES[key].names, id: null };
        const data = await templateRecipients(id);
        const signers = [...(data.signers || []), ...(data.carbonCopies || [])];
        const roles = signers.map((s) => ({
          role: s.roleName || "",
          labels: [...new Set(TAB_GROUPS.flatMap((g) => (s.tabs?.[g] || []).map((t) => t.tabLabel || t.groupName).filter(Boolean)))].sort(),
        }));
        const expected = EXPECTED[key] || { roles: [], labels: {} };
        const missingRoles = expected.roles.filter((r) => !roles.some((x) => x.role === r));
        const missingLabels = Object.entries(expected.labels).flatMap(([role, labels]) => {
          const have = new Set(roles.find((r) => r.role === role)?.labels || []);
          return labels.filter((l) => !have.has(l)).map((label) => ({ role, label }));
        });
        return { key, names: TEMPLATES[key].names, id, roles, missingRoles, missingLabels };
      })
    );
    return NextResponse.json({ templates: results });
  } catch (err) {
    return NextResponse.json({ error: err.message, consentRequired: err.consentRequired }, { status: 502 });
  }
}

// Staff-only maintenance of the management contract template (the DocuSign document-generation
// template "IRep Property Management Contract").
// POST { action: "pm-inspect" }                       template pages + every role's tabs and where they sit
// POST { action: "pm-replace" }                       upload the current contract Word file (src/lib/pm-contract-docx.js)
// POST { action: "pm-page", page, dpi? }              PNG of a template page (base64), to check placements
// POST { action: "pm-move", moves: [{ recipientId, group, tabId, page, x, y }] }  move template fields
export async function POST(request) {
  const sb = getSupabaseAdmin();
  if (!(await staffUser(sb, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ error: "DocuSign isn't set up yet." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  try {
    // Calibration: a one-page test envelope with text fields at known spots, signed in the browser by
    // an embedded (no email) test signer, to measure where DocuSign draws field text.
    if (body.action === "calib-create") {
      const cases = body.cases || [];
      const text = [], prefill = [];
      cases.forEach((c, r) => {
        const y = 80 + r * 60;
        [40, 200, 360].forEach((x, k) => {
          const tab = { documentId: "1", pageNumber: "1", xPosition: String(x), yPosition: String(y + (c.dy?.[k] || 0)), width: "140", height: String(c.h ?? 15), font: c.font || "arial", fontSize: c.size || "size9", value: c.value || "Hxg Mattu 123", locked: "true", tabLabel: `r${r}c${k}` };
          (c.prefill ? prefill : text).push(tab);
        });
      });
      const env = await ds("/envelopes", {
        method: "POST",
        body: {
          emailSubject: "TEST calibration (IRep staff)",
          status: "sent",
          documents: [{ documentId: "1", name: "calibration.pdf", fileExtension: "pdf", documentBase64: CALIB_PDF }],
          recipients: { signers: [{ recipientId: "1", routingOrder: "1", name: "IRep Calibration", email: "administration@ireppm.ca", clientUserId: "calib", tabs: { textTabs: text, signHereTabs: [{ documentId: "1", pageNumber: "1", xPosition: "120", yPosition: "750" }] } }] },
          ...(prefill.length ? { documents: [{ documentId: "1", name: "calibration.pdf", fileExtension: "pdf", documentBase64: CALIB_PDF, tabs: { prefillTabs: { textTabs: prefill } } }] } : {}),
        },
      });
      const view = await ds(`/envelopes/${env.envelopeId}/views/recipient`, {
        method: "POST",
        body: { returnUrl: "https://ireppm.ca/admin", authenticationMethod: "none", email: "administration@ireppm.ca", userName: "IRep Calibration", clientUserId: "calib" },
      });
      return NextResponse.json({ envelopeId: env.envelopeId, url: view.url });
    }
    // Calibration lease: the real lease template filled with sample details, landlord role only, signed in
    // the browser by an embedded test signer (no email), to check where every value prints.
    if (body.action === "calib-lease") {
      const { buildLease } = await import("@/lib/docusign-templates");
      const leaseId = await resolveTemplateId("lease");
      const f = {
        unit_id: "test", landlord_name: "Sample Landlord Holdings Inc.", landlord2_name: "Second Owner Name",
        unit_label: "Upper Room 1", street_number: "1753", street_name: "Benjamin Ave", city: "Windsor", postal_code: "N8X 4N7",
        parking: "1 outdoor spot, driveway", start_date: "2026-11-01", end_date: "2027-10-31", term: "fixed", rent_due_day: 1,
        base_rent: 1850, parking_rent: 50, rent_deposit: 1900, key_deposit: 50, key_deposit_details: "Refundable on return of 2 keys",
        services: { laundry: true }, laundry_charge: "none", utilities: { electricity: "tenant", heat: "tenant", water: "landlord" },
        utilities_details: "Tenant pays hydro and gas; water included.", services_details: "Shared laundry in basement.",
        other_charges: [{ description: "Storage locker", amount: 25 }],
        tenants: [{ full_name: "Jordan Sample", email: "tenant@example.com" }],
        signer: { name: "IRep Calibration", email: "administration@ireppm.ca" },
      };
      const built = buildLease(f, { lease: leaseId }, null);
      const landlord = built.definition.templateRoles.find((r) => r.roleName === "Landlord");
      const env = await ds("/envelopes", {
        method: "POST",
        body: {
          emailSubject: "TEST lease calibration (IRep staff)",
          status: "created",
          templateId: leaseId,
          templateRoles: [{ roleName: "Landlord", routingOrder: "1", name: "IRep Calibration", email: "administration@ireppm.ca", clientUserId: "calib", tabs: landlord.tabs }],
        },
      });
      await removeEmptyRecipients(env.envelopeId);
      await ds(`/envelopes/${env.envelopeId}`, { method: "PUT", body: { status: "sent" } });
      const view = await ds(`/envelopes/${env.envelopeId}/views/recipient`, {
        method: "POST",
        body: { returnUrl: "https://ireppm.ca/admin", authenticationMethod: "none", email: "administration@ireppm.ca", userName: "IRep Calibration", clientUserId: "calib" },
      });
      return NextResponse.json({ envelopeId: env.envelopeId, url: view.url });
    }
    if (body.action === "calib-page") {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.envelopeId || ""))) return NextResponse.json({ error: "envelopeId required." }, { status: 400 });
      const dpi = Math.min(150, Math.max(40, Number(body.dpi) || 72));
      const png = await ds(`/envelopes/${body.envelopeId}/documents/${body.documentId || "1"}/pages/${Number(body.page) || 1}/page_image?dpi=${dpi}&max_width=${Math.round(8.5 * dpi)}`, { binary: true, accept: "image/png" });
      return NextResponse.json({ dpi, png: png.toString("base64") });
    }

    // Generic template tools: any template by key (lease, N1, …) or by id.
    if (body.action === "tpl-list") {
      const data = await ds("/templates?count=100&include=recipients");
      return NextResponse.json({
        templates: (data.envelopeTemplates || []).map((t) => ({ id: t.templateId, name: t.name, modified: t.lastModified, used: t.lastUsed, folder: t.folderName })),
      });
    }
    if (String(body.action || "").startsWith("tpl-")) {
      const tid = /^[0-9a-f-]{36}$/i.test(String(body.templateId || "")) ? body.templateId : await resolveTemplateId(body.template);
      if (!tid) return NextResponse.json({ error: "Template not found." }, { status: 404 });
      if (body.action === "tpl-inspect") {
        const [docs, recips] = await Promise.all([ds(`/templates/${tid}/documents`), ds(`/templates/${tid}/recipients?include_tabs=true`)]);
        return NextResponse.json({
          templateId: tid,
          documents: (docs.templateDocuments || []).map((d) => ({ id: d.documentId, name: d.name, pages: Array.isArray(d.pages) ? d.pages.length : d.pages })),
          signers: [...(recips.signers || []), ...(recips.carbonCopies || [])].map((s) => ({ role: s.roleName, recipientId: s.recipientId, tabs: s.tabs || {} })),
        });
      }
      if (body.action === "tpl-page") {
        const page = Math.max(1, Number(body.page) || 1);
        const dpi = Math.min(150, Math.max(40, Number(body.dpi) || 72));
        const png = await ds(`/templates/${tid}/documents/${body.documentId || "1"}/pages/${page}/page_image?dpi=${dpi}`, { binary: true, accept: "image/png" });
        return NextResponse.json({ page, dpi, png: png.toString("base64") });
      }
      // { updates: [{ recipientId, group, tab: { tabId, ...props } }] } — PUT the given props on template tabs.
      if (body.action === "tpl-update") {
        const byRecipient = {};
        for (const u of body.updates || []) {
          if (!u.recipientId || !u.group || !u.tab?.tabId) continue;
          ((byRecipient[u.recipientId] ||= {})[u.group] ||= []).push(u.tab);
        }
        const results = [];
        for (const [rid, tabs] of Object.entries(byRecipient)) {
          const out = await ds(`/templates/${tid}/recipients/${rid}/tabs`, { method: "PUT", body: tabs });
          const errors = Object.values(out || {}).flat().filter((t) => t?.errorDetails).map((t) => `${t.tabLabel || t.tabId}: ${t.errorDetails.message}`);
          results.push({ recipientId: rid, updated: Object.values(tabs).flat().length, errors });
        }
        return NextResponse.json({ ok: true, results });
      }
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const id = await resolveTemplateId("pm_contract");
    if (!id) return NextResponse.json({ error: "Management contract template not found." }, { status: 404 });

    if (body.action === "pm-inspect") {
      const [docs, recips] = await Promise.all([ds(`/templates/${id}/documents`), ds(`/templates/${id}/recipients?include_tabs=true`)]);
      const roles = [...(recips.signers || []), ...(recips.carbonCopies || [])].map((s) => ({
        role: s.roleName,
        recipientId: s.recipientId,
        tabs: Object.entries(s.tabs || {}).flatMap(([group, list]) =>
          (Array.isArray(list) ? list : []).map((t) => ({
            group, tabId: t.tabId, label: t.tabLabel || t.groupName || "", page: Number(t.pageNumber), x: Number(t.xPosition), y: Number(t.yPosition),
            width: t.width, height: t.height, anchor: t.anchorString || undefined,
            ...(group === "radioGroupTabs" ? { radios: (t.radios || []).map((r) => ({ page: Number(r.pageNumber), x: Number(r.xPosition), y: Number(r.yPosition), value: r.value })) } : {}),
          }))
        ),
      }));
      return NextResponse.json({
        templateId: id,
        documents: (docs.templateDocuments || []).map((d) => ({ id: d.documentId, name: d.name, pages: d.pages?.length ?? d.pages, docGen: d.isDocGenDocument, keys: Object.keys(d) })),
        roles,
      });
    }

    if (body.action === "pm-replace") {
      const { PM_CONTRACT_DOCX_BASE64, PM_CONTRACT_DOCX_NAME } = await import("@/lib/pm-contract-docx");
      await ds(`/templates/${id}/documents`, {
        method: "PUT",
        body: { documents: [{ documentId: "1", name: PM_CONTRACT_DOCX_NAME, fileExtension: "docx", order: "1", isDocGenDocument: "true", documentBase64: PM_CONTRACT_DOCX_BASE64 }] },
      });
      const docs = await ds(`/templates/${id}/documents`);
      return NextResponse.json({ ok: true, documents: docs.templateDocuments || [] });
    }

    if (body.action === "pm-page") {
      const page = Math.max(1, Number(body.page) || 1);
      const dpi = Math.min(150, Math.max(40, Number(body.dpi) || 72));
      const png = await ds(`/templates/${id}/documents/1/pages/${page}/page_image?dpi=${dpi}`, { binary: true, accept: "image/png" });
      return NextResponse.json({ page, dpi, png: png.toString("base64") });
    }

    if (body.action === "pm-move") {
      const byRecipient = {};
      for (const m of body.moves || []) {
        if (!m.recipientId || !m.group || !m.tabId) continue;
        const r = (byRecipient[m.recipientId] ||= {});
        (r[m.group] ||= []).push({ tabId: m.tabId, documentId: "1", pageNumber: String(m.page), xPosition: String(Math.round(m.x)), yPosition: String(Math.round(m.y)) });
      }
      const results = [];
      for (const [rid, tabs] of Object.entries(byRecipient)) {
        const out = await ds(`/templates/${id}/recipients/${rid}/tabs`, { method: "PUT", body: tabs });
        const errors = Object.values(out || {}).flat().filter((t) => t?.errorDetails).map((t) => `${t.tabLabel || t.tabId}: ${t.errorDetails.message}`);
        results.push({ recipientId: rid, moved: Object.values(tabs).flat().length, errors });
      }
      return NextResponse.json({ ok: true, results });
    }

    // Test draft from the template: document-generation fields + where every field landed. The draft
    // goes straight to the deleted folder afterwards.
    if (body.action === "pm-test") {
      const env = await ds("/envelopes", {
        method: "POST",
        body: {
          templateId: id,
          status: "created",
          emailSubject: "TEST (deleted automatically) IRep Property Management Contract",
          templateRoles: [
            { roleName: "Landlord (Authorized Signatory)", name: "Test Landlord", email: "administration@ireppm.ca" },
            { roleName: "Landlord (Owner 2)", name: "Test Owner Two", email: "administration+owner2@ireppm.ca" },
            { roleName: "Manager", name: "Zan Greksa", email: "chuckfixedmyhouse@gmail.com" },
          ],
        },
      });
      const envelopeId = env.envelopeId;
      try {
        await removeEmptyRecipients(envelopeId);
        await addTabsByRole(
          envelopeId,
          pmContractTabs(
            [
              { name: "Test Landlord", email: "administration@ireppm.ca", phone: "519-555-0101" },
              { name: "Test Owner Two", email: "administration@ireppm.ca", phone: "519-555-0102" },
            ],
            {
              corporation: true,
              addons: ["snow_lawn", "appliance"],
              contract: {
                effective_date: "2026-10-19", commencement_date: "2026-11-01", engagement: "resign", managed_since: "2025-08-31", corporation_name: "Test Holdings Inc.",
                corporation_number: "1234567", notice_address: "1 Test St, Windsor, ON N9A 1A1", property_address: "123 Sample St",
                city_postal: "Windsor, ON N8X 1T5", leases: 3, monthly_discount: 50, response_time: "48 hours",
              },
            }
          )
        );
        if (body.propertyId) await fillLeaseSchedule(envelopeId, await pmLeaseRows(sb, body.propertyId));
        const [fields, recips, docs] = await Promise.all([
          ds(`/envelopes/${envelopeId}/docGenFormFields`).catch((e) => ({ error: e.message })),
          ds(`/envelopes/${envelopeId}/recipients?include_tabs=true`),
          ds(`/envelopes/${envelopeId}/documents`),
        ]);
        const tabs = (recips.signers || []).flatMap((s) =>
          Object.entries(s.tabs || {}).flatMap(([group, list]) =>
            (Array.isArray(list) ? list : []).map((t) => ({ role: s.roleName, group, label: t.tabLabel, anchor: t.anchorString, page: Number(t.pageNumber), x: Number(t.xPosition), y: Number(t.yPosition), value: t.value }))
          )
        );
        return NextResponse.json({
          envelopeId,
          pages: (docs.envelopeDocuments || []).map((d) => d.pages?.length ?? d.pages),
          docGen: fields.error ? { error: fields.error } : (fields.docGenFormFields || []).map((d) => ({ documentId: d.documentId, fields: (d.docGenFormFieldList || []).map((f) => f.name || f.Name || f.label) })),
        documents: (docs.envelopeDocuments || []).map((d) => ({ id: d.documentId, name: d.name, docGen: d.isDocGenDocument, type: d.type })),
          tabs,
        });
      } finally {
        if (!body.keep) await ds("/folders/recyclebin", { method: "PUT", body: { envelopeIds: [envelopeId] } }).catch((e) => console.error("[docusign] test draft cleanup:", e.message));
      }
    }

    // Full tab definitions of an envelope made from the template (to rebuild template fields from).
    if (body.action === "env-tabs") {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.envelopeId || ""))) return NextResponse.json({ error: "envelopeId required." }, { status: 400 });
      const data = await ds(`/envelopes/${body.envelopeId}/recipients?include_tabs=true`);
      return NextResponse.json({ signers: (data.signers || []).map((s) => ({ role: s.roleName, recipientId: s.recipientId, tabs: s.tabs || {} })) });
    }

    // Every role's fields exactly as stored (to put them back after the document is replaced).
    if (body.action === "pm-raw-tabs") {
      const recips = await ds(`/templates/${id}/recipients?include_tabs=true`);
      return NextResponse.json({ signers: (recips.signers || []).map((s) => ({ role: s.roleName, recipientId: s.recipientId, tabs: s.tabs || {} })) });
    }

    // DocuSign Connect: tell DocuSign to notify the website whenever an envelope changes.
    if (body.action === "connect-setup") {
      const url = "https://ireppm.ca/api/docusign/connect";
      const existing = await ds("/connect").catch((e) => ({ error: e.message }));
      if (existing.error) return NextResponse.json({ error: `Couldn't read Connect settings: ${existing.error}` }, { status: 502 });
      const mine = (existing.configurations || []).find((c) => c.urlToPublishTo === url);
      const config = {
        configurationType: "custom",
        name: "IRep website",
        urlToPublishTo: url,
        allUsers: "true",
        allowEnvelopePublish: "true",
        enableLog: "true",
        includeHMAC: "true",
        deliveryMode: "SIM",
        requiresAcknowledgement: "true",
        eventData: { version: "restv2.1", format: "json", includeData: ["recipients"] },
        events: [
          "envelope-sent", "envelope-delivered", "envelope-completed", "envelope-declined", "envelope-voided",
          "recipient-sent", "recipient-delivered", "recipient-completed", "recipient-declined",
        ],
      };
      const saved = mine
        ? await ds("/connect", { method: "PUT", body: { ...config, connectId: mine.connectId } })
        : await ds("/connect", { method: "POST", body: config });
      return NextResponse.json({ ok: true, updated: Boolean(mine), connectId: saved.connectId || mine?.connectId, others: (existing.configurations || []).filter((c) => c !== mine).map((c) => `${c.name}: ${c.urlToPublishTo}`) });
    }

    if (body.action === "connect-log") {
      const [logs, failures] = await Promise.all([
        ds("/connect/logs").catch((e) => ({ error: e.message })),
        ds("/connect/failures").catch((e) => ({ error: e.message })),
      ]);
      const brief = (l) => ({ created: l.created, status: l.status, env: l.envelopeId, error: l.error, url: l.connectUrl });
      return NextResponse.json({
        logs: logs.error || (logs.logs || []).slice(0, 10).map(brief),
        failures: failures.error || (failures.failures || []).slice(0, 10).map(brief),
      });
    }

    // Remove every field from the template (before re-adding them with new placements).
    if (body.action === "pm-clear-tabs") {
      const recips = await ds(`/templates/${id}/recipients?include_tabs=true`);
      let removed = 0;
      for (const s of recips.signers || []) {
        const tabs = {};
        for (const [group, list] of Object.entries(s.tabs || {})) {
          if (Array.isArray(list) && list.length) tabs[group] = list.map((t) => ({ tabId: t.tabId }));
        }
        if (!Object.keys(tabs).length) continue;
        await ds(`/templates/${id}/recipients/${s.recipientId}/tabs`, { method: "DELETE", body: tabs });
        removed += Object.values(tabs).flat().length;
      }
      return NextResponse.json({ ok: true, removed });
    }

    // Add fields to a template role: { recipientId, tabs: { textTabs: [...], ... } }
    if (body.action === "pm-add-tabs") {
      if (!body.recipientId || !body.tabs) return NextResponse.json({ error: "recipientId and tabs required." }, { status: 400 });
      const out = await ds(`/templates/${id}/recipients/${body.recipientId}/tabs`, { method: "POST", body: body.tabs });
      const errors = Object.values(out || {}).flat().filter((t) => t?.errorDetails).map((t) => `${t.tabLabel || t.tabId}: ${t.errorDetails.message}`);
      return NextResponse.json({ ok: !errors.length, added: Object.values(out || {}).flat().length, errors });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 502 });
  }
}
