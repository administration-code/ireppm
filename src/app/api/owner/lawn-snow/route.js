import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerIdsFromRequest } from "@/lib/server-auth";
import { lawnSnowBoard } from "@/lib/lawn-snow";
import { chuckPartnerId, pushTo } from "@/lib/push";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { money } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownerBoard(sb, ownerIds) {
  const { data: props } = await sb.from("properties").select("id, address, management_package").in("owner_id", ownerIds);
  return lawnSnowBoard(sb, (props || []).filter((p) => p.management_package !== "leasing_only"));
}

// Landlord portal: each managed property's lawn and snow price (plus HST), last visits and open requests.
export async function GET(request) {
  const sb = getSupabaseAdmin();
  const ownerIds = await ownerIdsFromRequest(sb, request);
  if (!ownerIds?.length) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const board = await ownerBoard(sb, ownerIds);
  const strip = (r) => ({
    id: r.id,
    included: r.included,
    fee: r.fee,
    lastLawn: r.lastLawn?.on || null,
    lastSnow: r.lastSnow?.on || null,
    requests: (r.requests || []).map((q) => ({ kind: q.kind, on: q.on })),
  });
  return NextResponse.json({ properties: [...board.included, ...board.alaCarte].map(strip), canRequest: board.canRequest !== false });
}

// POST { property_id, kind: "lawn" | "snow", note }: a landlord not on the plan asks for a visit.
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const ownerIds = await ownerIdsFromRequest(sb, request);
  if (!ownerIds?.length) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!["lawn", "snow"].includes(body.kind)) return NextResponse.json({ error: "Choose lawn or snow." }, { status: 400 });
  const board = await ownerBoard(sb, ownerIds);
  const row = board.alaCarte.find((r) => r.id === body.property_id);
  if (!row) return NextResponse.json({ error: "That property is on the lawn and snow plan, or isn't yours." }, { status: 400 });
  if ((row.requests || []).some((q) => q.kind === body.kind)) return NextResponse.json({ ok: true, already: true });
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  const { data: prop } = await sb.from("properties").select("owner_id, address").eq("id", row.id).maybeSingle();
  const { error } = await sb.from("lawn_snow_requests").insert({ property_id: row.id, owner_id: prop?.owner_id || null, kind: body.kind, note });
  if (error) return NextResponse.json({ error: "Requests aren't switched on yet. Email us instead." }, { status: 500 });

  const what = body.kind === "lawn" ? "lawn cut" : "snow clearing";
  const partnerId = await chuckPartnerId(sb);
  if (partnerId)
    await pushTo(sb, { partnerId }, { title: `Landlord asked for a ${what}`, body: `${prop?.address}${note ? `: ${note}` : ""}`, url: "/agent/visits", tag: `ls-${row.id}` }).catch(() => null);
  if (mailConfigured()) {
    const { data: chuck } = partnerId ? await sb.from("partners").select("email").eq("id", partnerId).maybeSingle() : { data: null };
    const rows = [
      ["Property", prop?.address || ""],
      ["Asked for", what],
      ["Charge", `${money(row.fee.amount)} + HST per visit`],
      ...(note ? [["Note", note]] : []),
    ];
    const heading = "Landlord Request: Lawn and Snow";
    const link = { href: "https://ireppm.ca/agent/visits", label: "Open Lawn and Snow" };
    await mailer()
      .emails.send({
        from: "IRep Property Management <alerts@ireppm.ca>",
        to: [chuck?.email || "administration@ireppm.ca"],
        subject: `Landlord asked for a ${what}: ${prop?.address}`,
        html: renderEmail({ heading, intro: `The landlord asked for a ${what}. Log it on Lawn and Snow when it's done; they're billed per visit.`, rows, link }),
        text: renderText({ heading, rows, link }),
      })
      .catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
