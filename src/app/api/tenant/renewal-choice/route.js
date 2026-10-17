import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { SITE_URL, bearer, sendMail, staffEmails, userClient } from "@/lib/application-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LABEL = {
  month_to_month: "stay on month to month",
  new_lease: "sign a new lease",
  moving_out: "move out at the end of the lease",
};

// A tenant tells us what they'll do when their fixed term ends.
// POST { tenancy_id, choice }  with  Authorization: Bearer <session token>
export async function POST(request) {
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { error } = await userClient(token).rpc("tenant_set_renewal_choice", { p_tenancy_id: body?.tenancy_id, p_choice: body?.choice });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: t } = await getSupabaseAdmin()
    .from("tenancies")
    .select("end_date, tenancy_tenants(full_name), unit:units(label, property:properties(address, owner:owners(name, email)))")
    .eq("id", body.tenancy_id)
    .maybeSingle();
  if (t) {
    const place = [t.unit?.property?.address, t.unit?.label].filter(Boolean).join(", ");
    const who = (t.tenancy_tenants || []).map((x) => x.full_name).join(", ") || "The tenant";
    const line = `${who} at ${place} would like to ${LABEL[body.choice]} (lease ends ${t.end_date}).`;
    const next = {
      month_to_month: "Nothing to sign: the tenancy continues month to month on the same terms.",
      new_lease: "Talk to the landlord about the terms, then send a new lease from the unit page.",
      moving_out: "They'll give their N9 in the portal. Start planning the turnover and showings.",
    }[body.choice];
    await sendMail({ to: staffEmails(), subject: `Lease-end choice: ${place}`, lines: [line, next], link: `${SITE_URL}/admin/units`, linkLabel: "Open units" });
    const owner = t.unit?.property?.owner;
    if (owner?.email)
      await sendMail({
        to: owner.email,
        subject: `Your tenant's plans at ${place}`,
        lines: [`Hi ${String(owner.name || "").split(" ")[0] || "there"},`, line, "IRep will follow up with you about next steps."],
      });
  }
  return NextResponse.json({ ok: true });
}
