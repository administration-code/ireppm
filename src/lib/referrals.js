import "server-only";
import { sendMail, SITE_URL } from "@/lib/application-review";

// Landlord referral thank-you: one month's management fee free, credited on the referrer's statement
// once the referred landlord's first full month with IRep is done.
const monthName = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { month: "long", year: "numeric" });

export async function listReferrals(admin) {
  const [refs, owners, props] = await Promise.all([
    admin.from("referrals").select("*").order("created_at", { ascending: false }),
    admin.from("owners").select("id, name, email").order("name"),
    admin.from("properties").select("id, address, owner_id, monthly_fee, archived").order("address"),
  ]);
  if (refs.error) throw new Error(refs.error.message);
  return { referrals: refs.data || [], owners: owners.data || [], properties: (props.data || []).filter((p) => !p.archived) };
}

export async function createReferral(admin, b) {
  const referred_name = String(b.referred_name || "").trim().slice(0, 120);
  if (!referred_name) throw new Error("Add the name of the landlord who was referred.");
  const { error } = await admin.from("referrals").insert({
    referrer_owner_id: b.referrer_owner_id || null,
    referred_name,
    referred_email: String(b.referred_email || "").trim().toLowerCase().slice(0, 200) || null,
    referred_owner_id: b.referred_owner_id || null,
    notes: String(b.notes || "").trim().slice(0, 500) || null,
  });
  if (error) throw new Error(error.message);
}

export async function updateReferral(admin, id, b) {
  const patch = {};
  for (const k of ["referrer_owner_id", "referred_owner_id"]) if (k in b) patch[k] = b[k] || null;
  if ("notes" in b) patch.notes = String(b.notes || "").trim().slice(0, 500) || null;
  const { error } = await admin.from("referrals").update(patch).eq("id", id).eq("status", "pending");
  if (error) throw new Error(error.message);
}

// Credit one month's fee (plus HST) on the referrer's property statement and thank them by email.
export async function creditReferral(admin, id, { propertyId, period }) {
  const { data: r } = await admin.from("referrals").select("*").eq("id", id).maybeSingle();
  if (!r) throw new Error("Referral not found.");
  if (r.status !== "pending") throw new Error("This referral has already been dealt with.");
  if (!r.referrer_owner_id) throw new Error("Choose who referred them first.");
  if (!/^\d{4}-\d{2}$/.test(String(period || ""))) throw new Error("Choose the month to credit.");
  const month = `${period}-01`;
  const { data: prop } = await admin.from("properties").select("id, address, owner_id").eq("id", propertyId).maybeSingle();
  if (!prop || prop.owner_id !== r.referrer_owner_id) throw new Error("Choose one of the referrer's properties.");
  const [{ data: fee }, { data: hstRow }] = await Promise.all([
    admin.rpc("property_fee_for_month", { p_property_id: prop.id, p_month: month }),
    admin.from("service_rates").select("amount").eq("key", "hst").maybeSingle(),
  ]);
  const base = Number(fee || 0);
  if (!(base > 0)) throw new Error("That property has no monthly fee to credit.");
  const amount = Math.round(base * (1 + Number(hstRow?.amount ?? 13) / 100) * 100) / 100;
  const { data: item, error } = await admin
    .from("statement_items")
    .insert({
      property_id: prop.id,
      period: month,
      kind: "fee_adjustment",
      description: `Referral thank-you: one month's management fee free for referring ${r.referred_name}`,
      amount,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await admin
    .from("referrals")
    .update({ status: "credited", credit_property_id: prop.id, credit_period: month, credit_amount: amount, statement_item_id: item.id })
    .eq("id", id);

  const { data: owner } = await admin.from("owners").select("name, email").eq("id", r.referrer_owner_id).maybeSingle();
  if (owner?.email) {
    const first = String(owner.name || "").split(/\s+/)[0] || "there";
    const sent = await sendMail({
      to: owner.email,
      subject: "Thank you for the referral: your next month is on us",
      lines: [
        `Hi ${first},`,
        `Thank you for referring ${r.referred_name} to IRep. Referrals from landlords like you are the best compliment we can get.`,
        `As a thank-you, we've waived your management fee for ${monthName(month)} on ${prop.address}. You'll see it on that month's statement as a credit of $${amount.toFixed(2)}, and it's added to your payout.`,
        "If you know anyone else who could use a hand with their rental, we'd be glad to help them too.",
      ],
      link: `${SITE_URL}/owner`,
      linkLabel: "Open your owner portal",
    }).catch(() => ({ sent: false }));
    if (sent?.sent) await admin.from("referrals").update({ thanked_at: new Date().toISOString() }).eq("id", id);
  }
  return { amount };
}

export async function declineReferral(admin, id, note) {
  const { error } = await admin
    .from("referrals")
    .update({ status: "declined", notes: String(note || "").trim().slice(0, 500) || null })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}
