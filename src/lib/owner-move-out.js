import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendMail, SITE_URL } from "@/lib/application-review";

const longDay = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";

// Tells the landlord a tenant is leaving. Stages:
//   n9_started     a tenant started an N9 from the portal (out for the tenants' signatures)
//   early_request  a tenant asked to leave earlier than an N9 allows (IRep reviewing)
//   on_notice      the tenancy is on notice: an N9 or N11 was signed, or staff recorded a notice
// Never throws: a failed email is logged and reported as { sent: false }.
export async function notifyOwnerMoveOut(tenancyId, { stage, date, reason } = {}) {
  try {
    const sb = getSupabaseAdmin();
    const { data: t } = await sb
      .from("tenancies")
      .select("id, move_out_date, tenancy_tenants(full_name, is_primary), unit:units(label, property:properties(address, owner:owners(name, email)))")
      .eq("id", tenancyId)
      .maybeSingle();
    const owner = t?.unit?.property?.owner;
    if (!owner?.email) return { sent: false, skipped: "no landlord email" };
    const place = [t.unit?.property?.address, t.unit?.label].filter(Boolean).join(", ");
    const names = (t.tenancy_tenants || [])
      .slice()
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((x) => x.full_name)
      .filter(Boolean);
    const who = names.length ? names.join(" and ") : "Your tenant";
    const have = names.length > 1 ? "have" : "has";
    const day = longDay(date || t.move_out_date);
    const hi = `Hi ${String(owner.name || "").split(" ")[0] || "there"},`;

    let subject;
    let lines;
    if (stage === "n9_started") {
      subject = `Tenant notice to end tenancy: ${place}`;
      lines = [
        hi,
        `${who} at ${place} ${have} started a notice to end their tenancy (Form N9)${day ? `, with a move-out date of ${day}` : ""}.`,
        "It's out for signature now. We'll confirm with you once it's signed and the move-out date is final.",
        "We'll be in touch about the move-out inspection and re-leasing the unit.",
      ];
    } else if (stage === "early_request") {
      subject = `Tenant request to end tenancy early: ${place}`;
      lines = [
        hi,
        `${who} at ${place} ${have} asked to end their tenancy early${day ? `, on ${day}` : ""}, sooner than the notice period normally allows.`,
        reason ? `Their reason: ${String(reason).slice(0, 500)}` : "",
        "IRep is reviewing the request and will contact you before anything is agreed. If it goes ahead, you'll receive an Agreement to End the Tenancy (Form N11) to sign.",
      ];
    } else {
      subject = `Tenancy ending: ${place}`;
      lines = [
        hi,
        `${who} at ${place} will be moving out${day ? ` on ${day}` : ""}. The tenancy is now on notice.`,
        reason ? `Notes: ${String(reason).slice(0, 500)}` : "",
        "We'll be in touch about the move-out inspection, any turnover work and re-leasing the unit.",
      ];
    }
    const r = await sendMail({ to: owner.email, subject, lines, link: `${SITE_URL}/owner`, linkLabel: "Open your owner portal" });
    return { sent: Boolean(r?.sent) };
  } catch (err) {
    console.error("[owner-move-out] email failed:", err?.message || err);
    return { sent: false };
  }
}
