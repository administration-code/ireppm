import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { staffFromRequest } from "@/lib/server-auth";
import { mailer, mailConfigured } from "@/lib/mailer";
import { renderEmail, renderText } from "@/lib/staff-alerts";
import { pushTo } from "@/lib/push";
import { money } from "@/lib/format";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HST = 13;

// Staff: a partner's estimate on a maintenance request.
//   POST { id, action: "send" }      → emails the landlord for approval (the estimated cost on the request, + HST)
//   POST { id, action: "approved" }  → landlord said yes: back on the partner's list, and they're told
//   POST { id, action: "declined" }  → landlord said no: the partner is told; staff close the request
export async function POST(request) {
  const sb = getSupabaseAdmin();
  const staff = await staffFromRequest(sb, request);
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { id, action } = await request.json().catch(() => ({}));
  const { data: r } = await sb
    .from("maintenance_requests")
    .select("id, title, status, partner_id, estimated_cost, estimate_plus_hst, vendor_estimate_notes, staff_notes, partner:partners(id, name, email), unit:units(label, property:properties(address, owner:owners(name, email)))")
    .eq("id", id)
    .maybeSingle();
  if (!r) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const place = [r.unit?.property?.address, r.unit?.label && !/^Whole/i.test(r.unit.label) ? r.unit.label : ""].filter(Boolean).join(", ");
  const now = new Date().toISOString();

  if (action === "send") {
    const owner = r.unit?.property?.owner;
    if (!owner?.email) return NextResponse.json({ error: "There's no landlord email on file for this property." }, { status: 400 });
    if (!(Number(r.estimated_cost) > 0)) return NextResponse.json({ error: "Add the estimated cost first." }, { status: 400 });
    if (!mailConfigured()) return NextResponse.json({ error: "Email isn't set up." }, { status: 500 });
    const cost = Number(r.estimated_cost);
    const price = r.estimate_plus_hst ? `${money(cost)} + HST (${money(Math.round(cost * (100 + HST)) / 100)} total)` : money(cost);
    const rows = [["Property", place], ["Repair", r.title], ...(r.vendor_estimate_notes ? [["Work needed", r.vendor_estimate_notes]] : []), ["Estimate", price]];
    const intro = `Hi ${owner.name || "there"}, our maintenance lead visited ${place} about "${r.title}". The repair needs your OK before we go ahead. Please reply to this email to approve it, or with any questions.`;
    const heading = "Your Approval Is Needed";
    const { error } = await mailer().emails.send({
      from: `${SITE.name} <${SITE.email}>`,
      to: [owner.email.trim()],
      replyTo: SITE.email,
      subject: `Approval needed: ${r.title}, ${r.unit?.property?.address || ""}`.slice(0, 150),
      html: renderEmail({ heading, intro, rows }),
      text: renderText({ heading, rows, extra: intro }),
    });
    if (error) return NextResponse.json({ error: "The email didn't send. Try again." }, { status: 500 });
    await sb
      .from("maintenance_requests")
      .update({ estimate_sent_at: now, owner_approval: "pending", status: "awaiting_owner", staff_notes: [r.staff_notes, `${now.slice(0, 10)}: estimate sent to the landlord (${owner.email}).`].filter(Boolean).join("\n") })
      .eq("id", r.id);
    return NextResponse.json({ ok: true, to: owner.email });
  }

  if (action === "approved" || action === "declined") {
    const yes = action === "approved";
    const { error } = await sb
      .from("maintenance_requests")
      .update({
        owner_approval: action,
        owner_decision_at: now,
        ...(yes ? { status: "triaged" } : {}),
        staff_notes: [r.staff_notes, `${now.slice(0, 10)}: landlord ${action} the estimate.`].filter(Boolean).join("\n"),
      })
      .eq("id", r.id);
    if (error) return NextResponse.json({ error: "That didn't save." }, { status: 500 });
    if (r.partner_id) {
      const body = yes ? `${r.title} at ${place}: go ahead. Tap Fixed It on Site when it's done.` : `${r.title} at ${place}: the landlord said no, so there's nothing to do.`;
      await pushTo(sb, { partnerId: r.partner_id }, { title: yes ? "Landlord approved your estimate" : "Landlord declined your estimate", body, url: "/agent#jobs", tag: `est-${r.id}` });
      if (r.partner?.email && mailConfigured()) {
        const heading = yes ? "Estimate Approved" : "Estimate Declined";
        const rows = [["Job", r.title], ["Where", place], ["Estimate", Number(r.estimated_cost) > 0 ? money(r.estimated_cost) : "—"]];
        const link = { href: `${SITE.url}/agent#jobs`, label: "Open your jobs" };
        await mailer()
          .emails.send({ from: "IRep Property Management <alerts@ireppm.ca>", to: [r.partner.email], replyTo: SITE.email, subject: `${heading}: ${r.title}`.slice(0, 150), html: renderEmail({ heading, intro: body, rows, link }), text: renderText({ heading, rows, link }) })
          .catch(() => null);
      }
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
