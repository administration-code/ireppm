import "server-only";
import { sendMail } from "@/lib/application-review";
import { SITE } from "@/lib/site";

const longDay = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "";
const dollars = (v) => (v === null || v === undefined || v === "" ? "" : `$${Number(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export const isAmendment = (row) => row.kind === "lease_amendment" || (row.kind === "other" && /amend/i.test(row.title || ""));

// First month's rent when the lease starts mid-month: the days from the start date to month end.
export function proratedFirstMonth(rent, start) {
  if (!rent || !start) return null;
  const d = new Date(`${String(start).slice(0, 10)}T12:00:00`);
  if (d.getDate() === 1) return null;
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return Math.round(((Number(rent) * (days - d.getDate() + 1)) / days) * 100) / 100;
}

// A signed lease that matches a tenancy already started by hand (same unit, upcoming, same start date):
// link them, so signing doesn't create a second tenancy.
export async function linkLeaseToUpcoming(sb, row) {
  if (row.kind !== "lease" || row.tenancy_id) return null;
  const unitId = row.terms?.unit_id || row.unit_id;
  const start = row.terms?.start_date;
  if (!unitId || !start) return null;
  const { data } = await sb.from("tenancies").select("id").eq("unit_id", unitId).eq("status", "upcoming").eq("start_date", start).limit(1);
  const id = data?.[0]?.id;
  if (!id) return null;
  await sb.from("signature_requests").update({ tenancy_id: id }).eq("id", row.id).is("tenancy_id", null);
  return id;
}

// Opens onboarding for a signed lease or amendment: the PayProp checklist (managed, rent-collecting
// tenancies only), a Needs Setup task when there's no tenancy to attach it to, and one summary email
// to the office. Runs once per document; never throws.
export async function openOnboarding(sb, requestId) {
  try {
    const { data: row } = await sb.from("signature_requests").select("*").eq("id", requestId).maybeSingle();
    if (!row || row.status !== "completed") return { opened: false };
    const amendment = isAmendment(row);
    if (row.kind !== "lease" && !amendment) return { opened: false };
    const { data: existing } = await sb.from("lease_onboarding").select("id").eq("signature_request_id", row.id).maybeSingle();
    if (existing) return { opened: false, already: true };

    let t = null;
    if (row.tenancy_id) {
      const { data } = await sb
        .from("tenancies")
        .select(
          "id, status, start_date, end_date, rent, last_month_deposit, collects_rent, unit:units(id, label, management_type, property:properties(id, address, city)), tenancy_tenants(full_name, email, is_primary, created_at)"
        )
        .eq("id", row.tenancy_id)
        .maybeSingle();
      t = data;
    }
    let unit = t?.unit || null;
    if (!unit && (row.terms?.unit_id || row.unit_id)) {
      const { data } = await sb
        .from("units")
        .select("id, label, management_type, property:properties(id, address, city)")
        .eq("id", row.terms?.unit_id || row.unit_id)
        .maybeSingle();
      unit = data;
    }
    const terms = row.terms || {};
    const tenants = (t?.tenancy_tenants?.length ? t.tenancy_tenants : terms.tenants || [])
      .slice()
      .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))
      .map((p) => ({ full_name: p.full_name || "", email: p.email || "" }));
    const rent = t?.rent ?? terms.rent ?? null;
    const start = t?.start_date ?? terms.start_date ?? null;
    const details = {
      title: row.title,
      address: unit?.property?.address || "",
      city: unit?.property?.city || "",
      unit: unit?.label || "",
      tenants,
      rent,
      start_date: start,
      end_date: t?.end_date ?? terms.end_date ?? null,
      lmr: t?.last_month_deposit ?? terms.last_month_deposit ?? null,
      prorated_first_month: proratedFirstMonth(rent, start),
    };
    const leasingOnly = (unit && unit.management_type !== "managed") || t?.collects_rent === false;
    const needsPayprop = !amendment && !leasingOnly && Boolean(unit);

    await sb.from("lease_onboarding").insert({
      signature_request_id: row.id,
      kind: amendment ? "amendment" : "lease",
      tenancy_id: t?.id || null,
      unit_id: unit?.id || null,
      property_id: unit?.property?.id || null,
      needs_payprop: needsPayprop,
      details,
    });

    const link = unit?.id ? `/admin/units/${unit.id}` : `/admin/signatures/${row.id}`;
    if (!amendment && !t) {
      await sb.from("staff_tasks").insert({
        kind: "needs_setup",
        title: `Needs setup: ${row.title}`,
        detail: "The lease is signed but isn't attached to a tenancy. Start the tenancy (or the next tenancy) on the unit page; it's filled in from the lease.",
        signature_request_id: row.id,
        unit_id: unit?.id || null,
        property_id: unit?.property?.id || null,
        link,
        source: "system",
      });
    }
    if (amendment) {
      await sb.from("staff_tasks").insert({
        kind: "amendment",
        title: `Record the changes in: ${row.title}`,
        detail: "Enter the amendment's effective date, new rent and any tenants added or removed on the Onboarding page. They're applied on the effective date.",
        signature_request_id: row.id,
        tenancy_id: t?.id || null,
        unit_id: unit?.id || null,
        property_id: unit?.property?.id || null,
        link: "/admin/onboarding",
        source: "system",
      });
    }

    const place = [details.address, details.unit && !/^whole/i.test(details.unit) ? details.unit : ""].filter(Boolean).join(", ");
    const lines = [
      `${row.title} has been signed by everyone.`,
      place ? `Property: ${place}` : "",
      tenants.length ? `Tenants: ${tenants.map((p) => `${p.full_name}${p.email ? ` (${p.email})` : ""}`).join("; ")}` : "",
      rent ? `Rent: ${dollars(rent)} a month` : "",
      start ? `Term: ${longDay(start)}${details.end_date ? ` to ${longDay(details.end_date)}` : " (month to month after)"}` : "",
      details.lmr ? `Last month's rent: ${dollars(details.lmr)}` : "",
      details.prorated_first_month ? `First month prorated: ${dollars(details.prorated_first_month)}` : "",
      amendment
        ? "Next: record the amendment's changes on the Onboarding page."
        : !t
          ? "Next: this lease isn't attached to a tenancy yet. Start the tenancy on the unit page."
          : needsPayprop
            ? "Next: add the tenants in PayProp and send the PayProp letter, then tick both on the Onboarding page."
            : "Leasing only or maintenance only: no PayProp setup needed.",
    ].filter(Boolean);
    const r = await sendMail({ to: [SITE.email], subject: `Signed: ${row.title}`, lines, link: "https://ireppm.ca/admin/onboarding", linkLabel: "Open Onboarding" });
    if (r?.sent) await sb.from("lease_onboarding").update({ summary_sent_at: new Date().toISOString() }).eq("signature_request_id", row.id);
    return { opened: true };
  } catch (err) {
    console.error("[onboarding] failed:", err?.message || err);
    return { opened: false };
  }
}
