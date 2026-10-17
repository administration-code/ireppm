import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { SITE_URL, bearer, sendMail, staffEmails, userClient } from "@/lib/application-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// After a tenant uploads proof of insurance (or staff/landlord review it): tell the right people.
// POST { id, event: "uploaded" | "reviewed" }  with  Authorization: Bearer <session token>
export async function POST(request) {
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { data: visible } = await userClient(token).from("tenant_insurance").select("id").eq("id", body?.id).maybeSingle();
  if (!visible) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const admin = getSupabaseAdmin();
  const { data: ins } = await admin
    .from("tenant_insurance")
    .select("*, tenancy:tenancies(id, tenancy_tenants(full_name, email), unit:units(label, property:properties(address, owner:owners(name, email))))")
    .eq("id", body.id)
    .maybeSingle();
  if (!ins) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const place = [ins.tenancy?.unit?.property?.address, ins.tenancy?.unit?.label].filter(Boolean).join(", ");
  const owner = ins.tenancy?.unit?.property?.owner;
  const tenants = (ins.tenancy?.tenancy_tenants || []).map((t) => t.email).filter(Boolean);

  if (body.event === "uploaded") {
    const facts = [ins.insurer && `Insurer: ${ins.insurer}`, ins.policy_number && `Policy: ${ins.policy_number}`, ins.expires_on && `Expires: ${ins.expires_on}`]
      .filter(Boolean)
      .join("\n");
    await sendMail({
      to: staffEmails(),
      subject: `Proof of tenant insurance to review: ${place}`,
      lines: [`The tenant at ${place} uploaded proof of tenant insurance.`, facts],
      link: `${SITE_URL}/admin/insurance`,
      linkLabel: "Review it",
    });
    if (owner?.email)
      await sendMail({
        to: owner.email,
        subject: `Your tenant's insurance: ${place}`,
        lines: [
          `Hi ${String(owner.name || "").split(" ")[0] || "there"},`,
          `The tenant at ${place} uploaded proof of tenant insurance. You can view it in your owner portal. IRep will check it too.`,
          facts,
        ],
        link: `${SITE_URL}/owner#insurance`,
        linkLabel: "View it",
      });
  } else if (body.event === "reviewed" && ins.status === "rejected" && tenants.length) {
    await sendMail({
      to: tenants,
      subject: "Please upload your tenant insurance again",
      lines: [`We couldn't accept the proof of insurance for ${place}.`, ins.review_note ? `What's missing: ${ins.review_note}` : "", "Please upload a new copy in your account."],
      link: `${SITE_URL}/account`,
      linkLabel: "Upload it again",
    });
  }
  return NextResponse.json({ ok: true });
}
