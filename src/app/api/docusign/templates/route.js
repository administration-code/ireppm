import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addTabsByRole, ds, isConfigured, removeEmptyRecipients, resolveTemplateId, templateRecipients } from "@/lib/docusign";
import { EXPECTED, TEMPLATES, pmContractTabs } from "@/lib/docusign-templates";
import { staffUser } from "@/lib/signatures-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
                effective_date: "2026-10-19", commencement_date: "2026-11-01", engagement: "new", corporation_name: "Test Holdings Inc.",
                corporation_number: "1234567", notice_address: "1 Test St, Windsor, ON N9A 1A1", property_address: "123 Sample St",
                city_postal: "Windsor, ON N8X 1T5", leases: 3, monthly_discount: 50, response_time: "48 hours",
              },
            }
          )
        );
        const [fields, recips, docs] = await Promise.all([
          ds(`/envelopes/${envelopeId}/docGenFormFields`).catch((e) => ({ error: e.message })),
          ds(`/envelopes/${envelopeId}/recipients?include_tabs=true`),
          ds(`/envelopes/${envelopeId}/documents`),
        ]);
        const tabs = (recips.signers || []).flatMap((s) =>
          Object.entries(s.tabs || {}).flatMap(([group, list]) =>
            (Array.isArray(list) ? list : []).map((t) => ({ role: s.roleName, group, label: t.tabLabel, anchor: t.anchorString, page: Number(t.pageNumber), x: Number(t.xPosition), y: Number(t.yPosition) }))
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
        if (!body.keep) await ds("/folders/recyclebin", { method: "PUT", body: { envelopeIds: [envelopeId] } }).catch(() => {});
      }
    }

    // Full tab definitions of an envelope made from the template (to rebuild template fields from).
    if (body.action === "env-tabs") {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.envelopeId || ""))) return NextResponse.json({ error: "envelopeId required." }, { status: 400 });
      const data = await ds(`/envelopes/${body.envelopeId}/recipients?include_tabs=true`);
      return NextResponse.json({ signers: (data.signers || []).map((s) => ({ role: s.roleName, recipientId: s.recipientId, tabs: s.tabs || {} })) });
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
