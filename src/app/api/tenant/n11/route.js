import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { alertStaff } from "@/lib/signatures-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A tenant asks to move out sooner than an N9 allows. This only records the request and tells
// staff; nothing is signed until IRep approves it (POST /api/docusign/n11).
//
// POST { tenancy_id, termination_date: "YYYY-MM-DD", reason?, phone? }  with  Authorization: Bearer <user token>
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { data: auth, error: authError } = await sb.auth.getUser(token);
  if (authError || !auth?.user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const user = auth.user;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const tenancyId = body?.tenancy_id;
  const date = String(body?.termination_date || "");
  if (!tenancyId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Choose the date you'd like to move out." }, { status: 400 });
  }

  const { data: member } = await sb
    .from("tenancy_tenants")
    .select("id")
    .eq("tenancy_id", tenancyId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "This isn't your tenancy." }, { status: 403 });

  const { data: prep, error: prepError } = await sb.rpc("n9_prepare", { p_tenancy_id: tenancyId });
  if (prepError) return NextResponse.json({ error: prepError.message }, { status: 400 });
  if (!prep?.ok) return NextResponse.json({ error: prep?.error || "You can't ask for this right now." }, { status: 400 });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  if (date <= today) return NextResponse.json({ error: "Choose a date after today." }, { status: 400 });
  if (prep.earliest && date >= prep.earliest) {
    return NextResponse.json(
      { error: "You can give an N9 notice for that date, so you don't need the landlord to agree. Use the notice form instead.", use_n9: true },
      { status: 400 }
    );
  }

  const { data: row, error } = await sb
    .from("n11_requests")
    .insert({
      tenancy_id: tenancyId,
      termination_date: date,
      reason: String(body?.reason || "").trim().slice(0, 1000) || null,
      phone: String(body?.phone || "").trim().slice(0, 40) || null,
      requested_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    const msg = /n11_requests_one_open/.test(error.message)
      ? "You already have a request waiting for IRep to review."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const place = [prep.property_address, prep.unit_label].filter(Boolean).join(", ");
  await alertStaff(`Early move-out request: ${place}`, [
    `${user.email} asked to end the tenancy at ${place} on ${date}, earlier than an N9 allows (earliest N9 date: ${prep.earliest}).`,
    body?.reason ? `Reason: ${String(body.reason).slice(0, 500)}` : "",
    "Approve it to send the N11 Agreement to End the Tenancy to every tenant and then to the landlord to sign, or decline it with a note.",
  ].filter(Boolean));

  return NextResponse.json({ id: row.id, status: "requested" });
}
