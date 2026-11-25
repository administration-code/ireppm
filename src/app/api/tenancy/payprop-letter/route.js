import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { userFromRequest } from "@/lib/server-auth";
import { staffUser } from "@/lib/signatures-server";
import { emailPaypropLetter } from "@/lib/tenant-notices";
import { getLetter, lettersForUser, letterTenants, listLetters, signedLetterUrl } from "@/lib/payprop-letters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PayProp welcome letters (one or more per tenancy, each for its own tenant(s)).
//   GET ?mine=1[&tenancy=<id>]  → the signed-in tenant's letters: [{ id, label }]
//   GET ?letter=<id>            → a 60-second link (staff, or a tenant the letter is for)
//   GET ?tenancy=<id>&list=1    → staff: every letter on the tenancy, with who it's for
//   GET ?tenancy=<id>[&check=1] → older callers: the tenant's first letter on that tenancy
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const who = await userFromRequest(sb, request);
  if (!who) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const staff = await staffUser(sb, request);
  const tenancyId = params.get("tenancy");

  if (params.get("list")) {
    if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
    const [letters, { data: people }] = await Promise.all([
      listLetters(sb, tenancyId),
      sb.from("tenancy_tenants").select("id, full_name, email, is_primary").eq("tenancy_id", tenancyId).order("is_primary", { ascending: false }),
    ]);
    return NextResponse.json({ letters: letters.map((l) => ({ ...l, path: undefined, tenants: letterTenants(l, people || []).map((p) => p.id) })), people: people || [] });
  }

  const mine = staff ? null : await lettersForUser(sb, who.user.id);
  if (params.get("letter")) {
    const letter = await getLetter(sb, params.get("letter"));
    if (!letter || (!staff && !mine.some((l) => l.id === letter.id))) return NextResponse.json({ error: "That letter isn't available." }, { status: 404 });
    const url = await signedLetterUrl(sb, letter);
    return url ? NextResponse.json({ url }) : NextResponse.json({ error: "We couldn't open that file." }, { status: 500 });
  }

  const list = staff ? (tenancyId ? await listLetters(sb, tenancyId) : []) : mine.filter((l) => !tenancyId || l.tenancy_id === tenancyId);
  if (params.get("mine") || params.get("check")) {
    return NextResponse.json({
      available: list.length > 0,
      letters: list.map((l, i) => ({ id: l.id, tenancy_id: l.tenancy_id, label: l.label || (list.length > 1 ? `Letter ${i + 1}` : null) })),
    });
  }
  if (!list.length) return NextResponse.json({ error: "No letter yet." }, { status: 404 });
  const url = await signedLetterUrl(sb, list[0]);
  return url ? NextResponse.json({ url }) : NextResponse.json({ error: "We couldn't open that file." }, { status: 500 });
}

// POST (staff only):
//   { letter, to: [emails] } → one letter to the chosen recipients (only that letter's own tenants)
//   { tenancy, person }      → that tenant's letter(s), each to its own tenants
//   { tenancy }              → every assigned letter on the tenancy, each to its own tenants
export async function POST(request) {
  const admin = getSupabaseAdmin();
  if (!(await staffUser(admin, request))) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { tenancy, letter, to, person } = await request.json().catch(() => ({}));
  try {
    const r = await emailPaypropLetter(admin, tenancy, { letterId: letter, to, personId: person });
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
