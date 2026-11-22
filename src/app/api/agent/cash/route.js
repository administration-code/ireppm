import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFromRequest } from "@/lib/server-auth";
import { cancelCollection, cashPartner, cashSummary, cashTenancies, logCollection, recordDeposit } from "@/lib/cash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agent Portal, for partners IRep has set up to collect cash (Chuck).
//   GET → { allowed, tenancies, held, deposits }
//   POST { action: "log", tenancy_id, amount, collected_on, kind, note }
//   POST { action: "cancel", id }
//   POST { action: "deposit", ids[], deposited_on, method, amount?, note? }
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const partner = await cashPartner(sb, await partnerFromRequest(sb, request));
  if (!partner) return NextResponse.json({ allowed: false });
  const [tenancies, summary] = await Promise.all([cashTenancies(sb), cashSummary(sb, partner.id)]);
  return NextResponse.json({ allowed: true, tenancies, ...summary });
}

export async function POST(request) {
  const sb = getSupabaseAdmin();
  const partner = await cashPartner(sb, await partnerFromRequest(sb, request));
  if (!partner) return NextResponse.json({ error: "Your account isn't set up for cash. Ask Rosie." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const out =
    body.action === "log"
      ? await logCollection(sb, partner, body)
      : body.action === "cancel"
        ? await cancelCollection(sb, partner, String(body.id || ""))
        : body.action === "deposit"
          ? await recordDeposit(sb, partner, body)
          : { error: "Unknown action." };
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
