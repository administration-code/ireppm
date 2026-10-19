import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ds, isConfigured, resolveTemplateId, templateRecipients } from "@/lib/docusign";
import { EXPECTED, TEMPLATES } from "@/lib/docusign-templates";
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
      return NextResponse.json({ templateId: id, documents: (docs.templateDocuments || []).map((d) => ({ id: d.documentId, name: d.name, pages: d.pages?.length ?? d.pages })), roles });
    }

    if (body.action === "pm-replace") {
      const { PM_CONTRACT_DOCX_BASE64, PM_CONTRACT_DOCX_NAME } = await import("@/lib/pm-contract-docx");
      await ds(`/templates/${id}/documents`, {
        method: "PUT",
        body: { documents: [{ documentId: "1", name: PM_CONTRACT_DOCX_NAME, fileExtension: "docx", order: "1", documentBase64: PM_CONTRACT_DOCX_BASE64 }] },
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

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 502 });
  }
}
