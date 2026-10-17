import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { bearer, sendMail, userClient } from "@/lib/application-review";
import { loadShowing, placeOf, prettyDay, respondLink, sendTenantNotice, showingAgents } from "@/lib/showings";
import { staffEmails } from "@/lib/application-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A renter accepts or declines the time IRep suggested.
// POST { id, accept: boolean }  with  Authorization: Bearer <session token>
export async function POST(request) {
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { data: result, error } = await userClient(token).rpc("renter_answer_showing", {
    p_id: body?.id,
    p_accept: Boolean(body?.accept),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const admin = getSupabaseAdmin();
  const s = await loadShowing(admin, body.id);
  if (s) {
    const { data: tok } = await admin.from("showing_action_tokens").select("token").eq("showing_id", s.id).maybeSingle();
    const who = s.renter?.full_name || s.renter?.email || "The renter";
    const agents = await showingAgents(admin, s.listing_id);
    await sendMail({
      to: [...new Set([...agents.emails, ...staffEmails()])],
      subject: `Showing ${result === "confirmed" ? "accepted" : "cancelled"}: ${placeOf(s.listing)}`,
      lines: [
        result === "confirmed"
          ? `${who} accepted the new time: ${prettyDay(s.preferred_date)}, ${s.preferred_time}.`
          : `${who} declined the suggested time, so the showing is cancelled.`,
        result === "confirmed" && !s.vacant ? "The current tenants have been sent written notice." : "",
      ].filter(Boolean),
      link: tok ? respondLink(tok.token) : undefined,
      linkLabel: "Open the showing",
    });
    if (result === "confirmed") await sendTenantNotice(admin, s);
  }
  return NextResponse.json({ status: result });
}
