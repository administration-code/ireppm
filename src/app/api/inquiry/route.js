import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Landlord inquiries and rent estimates from the public site. Bots are turned away by:
// a hidden "website" field people never see, a minimum time on the form, a cap per email
// address and a cap on the site as a whole.
const clip = (v, n) => (String(v ?? "").trim().slice(0, n) || null);
const MIN_SECONDS = 3;

export async function POST(request) {
  const b = await request.json().catch(() => ({}));
  if (clip(b.website, 50)) return NextResponse.json({ ok: true }); // honeypot: pretend it worked
  if (!b.started || Date.now() - Number(b.started) < MIN_SECONDS * 1000) return NextResponse.json({ ok: true });

  const name = clip(b.name, 120);
  const email = clip(b.email, 200)?.toLowerCase() || null;
  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "Add your name and a valid email address." }, { status: 400 });
  const message = clip(b.message, 3000);
  if (message && (message.match(/https?:\/\//gi) || []).length > 2) return NextResponse.json({ ok: true }); // link spam

  const admin = getSupabaseAdmin();
  const hour = new Date(Date.now() - 3600 * 1000).toISOString();
  const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [mine, all] = await Promise.all([
    admin.from("landlord_inquiries").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", day),
    admin.from("landlord_inquiries").select("id", { count: "exact", head: true }).gte("created_at", hour),
  ]);
  if ((mine.count || 0) >= 3) return NextResponse.json({ ok: true, duplicate: true });
  if ((all.count || 0) >= 30) return NextResponse.json({ error: "We're getting a lot of messages right now. Please email us instead." }, { status: 429 });

  const { error } = await admin.from("landlord_inquiries").insert({
    name,
    email,
    phone: clip(b.phone, 40),
    property_address: clip(b.property_address, 300),
    interest: clip(b.interest, 120),
    message,
  });
  if (error) return NextResponse.json({ error: "We couldn't send that. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
