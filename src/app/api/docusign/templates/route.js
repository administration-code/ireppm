import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isConfigured, resolveTemplateId, templateRecipients } from "@/lib/docusign";
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
