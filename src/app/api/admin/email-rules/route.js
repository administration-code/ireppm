import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { rematchAddress } from "@/lib/comms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = { tenant: "tenancy_id", landlord: "owner_id", applicant: "application_id", partner: "partner_id", lead: "lead_id", ignored: null };

// Staff: assign an email address to a tenant, landlord, applicant, partner or landlord lead (or ignore it).
// target_id "new" with party_kind "lead" adds a new lead from the email.
// The portal remembers it and moves every email from that address onto their timeline.
//   POST { email, party_kind, target_id?, name? }
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const staff = await staffFromRequest(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!email.includes("@") || !(body.party_kind in KINDS)) return NextResponse.json({ error: "Choose who this is." }, { status: 400 });
  const col = KINDS[body.party_kind];
  // "Add as a new lead": make the landlord lead from the email, then assign the address to it.
  if (body.party_kind === "lead" && body.target_id === "new") {
    const { data: lead, error: leadErr } = await sb
      .from("landlord_inquiries")
      .insert({
        name: String(body.name || email.split("@")[0]).slice(0, 200),
        email,
        interest: "Email",
        message: body.subject ? `First email: ${String(body.subject).slice(0, 300)}` : "Added from Unmatched Emails.",
        status: "new",
      })
      .select("id")
      .single();
    if (leadErr) return NextResponse.json({ error: "Couldn't add the lead." }, { status: 400 });
    body.target_id = lead.id;
  }
  if (col && !body.target_id) return NextResponse.json({ error: "Choose who this is." }, { status: 400 });
  const rule = {
    email,
    party_kind: body.party_kind,
    tenancy_id: null,
    owner_id: null,
    application_id: null,
    partner_id: null,
    ...(body.party_kind === "lead" ? { lead_id: null } : {}),
    name: body.name ? String(body.name).slice(0, 200) : null,
    created_by: staff.id,
  };
  if (col) rule[col] = body.target_id;
  const { error } = await sb.from("email_address_rules").upsert(rule, { onConflict: "email" });
  if (error) return NextResponse.json({ error: /lead/.test(error.message || "") ? "Leads aren't switched on yet: run migration 0103." : error.message }, { status: 400 });
  try {
    const party = await rematchAddress(sb, email);
    return NextResponse.json({ ok: true, party });
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
