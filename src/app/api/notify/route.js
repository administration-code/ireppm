import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { applicationEmail, landlordEmail, maintenanceEmail, showingEmail } from "@/lib/staff-alerts";
import { prettyDay, respondLink, showingAgents } from "@/lib/showings";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM = "IRep Property Management <alerts@ireppm.ca>";
const HANDLED_TABLES = new Set(["showing_requests", "applications", "landlord_inquiries", "maintenance_requests"]);

function secretMatches(provided) {
  const expected = process.env.NOTIFY_WEBHOOK_SECRET;
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function staffRecipients() {
  return (process.env.STAFF_ALERT_EMAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchListing(sb, listingId) {
  if (!listingId) return null;
  const { data, error } = await sb.from("listings").select("address, unit").eq("id", listingId).maybeSingle();
  if (error) console.error("[notify] listing lookup failed:", error.message);
  return data;
}

async function fetchUnit(sb, unitId) {
  if (!unitId) return null;
  const { data, error } = await sb
    .from("units")
    .select("label, property:properties(address, city)")
    .eq("id", unitId)
    .maybeSingle();
  if (error) console.error("[notify] unit lookup failed:", error.message);
  return data;
}

async function fetchRenter(sb, userId) {
  if (!userId) return null;
  const { data, error } = await sb.from("profiles").select("full_name, email, phone").eq("id", userId).maybeSingle();
  if (error) console.error("[notify] profile lookup failed:", error.message);
  return data;
}

async function buildEmail(table, record) {
  if (table === "landlord_inquiries") return landlordEmail(record);

  const sb = getSupabaseAdmin();
  if (table === "maintenance_requests") {
    return maintenanceEmail(record, await fetchUnit(sb, record.unit_id));
  }
  if (table === "showing_requests") {
    const [listing, renter, tok, vacant] = await Promise.all([
      fetchListing(sb, record.listing_id),
      fetchRenter(sb, record.user_id),
      sb.from("showing_action_tokens").select("token").eq("showing_id", record.id).maybeSingle(),
      sb.rpc("listing_is_vacant", { p_listing_id: record.listing_id }),
    ]);
    const url = tok?.data?.token ? respondLink(tok.data.token) : null;
    return showingEmail(record, listing, renter, url, vacant?.error ? undefined : Boolean(vacant?.data));
  }
  const listing = await fetchListing(sb, record.listing_id);
  return applicationEmail(record, listing);
}

export async function POST(request) {
  if (!secretMatches(request.headers.get("x-webhook-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, table, record } = payload || {};
  if (type !== "INSERT" || !HANDLED_TABLES.has(table) || !record || typeof record !== "object") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // From here on, always answer 200 so the database webhook doesn't retry endlessly.
  try {
    // Showing requests go to the property's showing agent(s) (or the default contact) and staff.
    const agents = table === "showing_requests" ? await showingAgents(getSupabaseAdmin(), record.listing_id) : null;
    const to = agents ? [...new Set([...staffRecipients(), ...agents.emails])] : staffRecipients();
    if (!to.length) throw new Error("STAFF_ALERT_EMAIL is not set");
    if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");

    const email = await buildEmail(table, record);
    // Chuck gets new showing requests by text, with the link to approve, decline or suggest a time.
    if (table === "showing_requests" && agents?.phones.length) {
      const sb = getSupabaseAdmin();
      const [{ data: tok }, listing] = await Promise.all([
        sb.from("showing_action_tokens").select("token").eq("showing_id", record.id).maybeSingle(),
        fetchListing(sb, record.listing_id),
      ]);
      const place = [listing?.address, listing?.unit].filter(Boolean).join(", ");
      if (tok?.token)
        await sendSms(agents.phones, `IRep showing request: ${place}, ${prettyDay(record.preferred_date)}, ${record.preferred_time}. Approve, decline or suggest a time: ${respondLink(tok.token)}`);
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from: FROM, to, ...email });
    if (error) throw new Error(`Resend: ${error.name || ""} ${error.message || ""}`.trim());

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[notify] could not send ${table} alert for ${record.id}:`, err?.message || err);
    return NextResponse.json({ ok: false, sent: false });
  }
}
