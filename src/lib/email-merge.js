import { getBrowserClient } from "@/lib/supabase";
import { SITE } from "@/lib/site";
import { money } from "@/lib/format";

// Merge fields available in email templates, with what each one means.
export const MERGE_FIELDS = {
  tenant_first_names: "Tenants' first names (Jane and Sam)",
  tenant_names: "Tenants' full names",
  first_names: "Tenants' or landlord's first names, whichever the email is for",
  landlord_name: "Landlord's name",
  landlord_first_name: "Landlord's first name",
  address: "Property address",
  unit: "Unit label",
  unit_suffix: "“, Unit 2” (blank for a whole home)",
  rent: "Monthly rent",
  balance: "Balance owing now",
  lmr: "Last month's rent held",
  amount: "An amount you type",
  date: "A date you choose",
  start_date: "Lease start date",
  end_date: "Lease end date",
  first_month_line: "Prorated first month line (blank when the lease starts on the 1st)",
  custom: "Your own text",
  today: "Today's date",
  payment_email: SITE.paymentEmail,
  office_phone: SITE.phone,
  emergency_phone: SITE.emergency.phone,
};

const longDay = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "";
const firsts = (names) => {
  const f = names.map((n) => String(n || "").trim().split(/\s+/)[0]).filter(Boolean);
  return f.length > 1 ? `${f.slice(0, -1).join(", ")} and ${f[f.length - 1]}` : f[0] || "there";
};

// Loads what a draft needs about the tenancy or landlord, and returns { values, to, ids }.
export async function mergeContext({ tenancyId, ownerId, amount, date, custom }) {
  const sb = getBrowserClient();
  const values = {
    today: longDay(new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" })),
    payment_email: SITE.paymentEmail,
    office_phone: SITE.phone,
    emergency_phone: SITE.emergency.phone,
    amount: amount ? money(Number(amount)) : "",
    date: date ? longDay(date) : "",
    custom: custom || "",
  };
  let to = [];
  const ids = { tenancy_id: tenancyId || null, owner_id: ownerId || null, property_id: null };
  if (tenancyId) {
    const [{ data: t }, { data: bal }] = await Promise.all([
      sb
        .from("tenancies")
        .select(
          "id, rent, start_date, end_date, last_month_deposit, tenancy_tenants(full_name, email, is_primary, created_at), unit:units(label, property:properties(id, address, owner:owners(id, name, email)))"
        )
        .eq("id", tenancyId)
        .maybeSingle(),
      sb.from("tenancy_balances").select("balance").eq("tenancy_id", tenancyId).maybeSingle(),
    ]);
    if (t) {
      const people = (t.tenancy_tenants || []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
      const label = t.unit?.label || "";
      Object.assign(values, {
        tenant_names: people.map((p) => p.full_name).join(", "),
        tenant_first_names: firsts(people.map((p) => p.full_name)),
        first_names: firsts(people.map((p) => p.full_name)),
        address: t.unit?.property?.address || "",
        unit: label,
        unit_suffix: label && !/^whole/i.test(label) ? `, ${label}` : "",
        rent: money(t.rent),
        lmr: t.last_month_deposit !== null ? money(t.last_month_deposit) : "",
        balance: money(Math.max(0, Number(bal?.balance || 0))),
        start_date: longDay(t.start_date),
        end_date: t.end_date ? longDay(t.end_date) : "",
        landlord_name: t.unit?.property?.owner?.name || "",
        landlord_first_name: firsts([t.unit?.property?.owner?.name]),
      });
      const d = t.start_date ? new Date(`${t.start_date}T12:00:00`) : null;
      if (d && d.getDate() !== 1) {
        const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        values.first_month_line = `First month (prorated from ${longDay(t.start_date)}): ${money((Number(t.rent) * (days - d.getDate() + 1)) / days)}.`;
      } else values.first_month_line = "";
      to = people.map((p) => p.email).filter(Boolean);
      ids.property_id = t.unit?.property?.id || null;
    }
  }
  if (ownerId && !tenancyId) {
    const { data: o } = await sb.from("owners").select("id, name, email, properties(id, address)").eq("id", ownerId).maybeSingle();
    if (o) {
      Object.assign(values, {
        landlord_name: o.name || "",
        landlord_first_name: firsts([o.name]),
        first_names: firsts([o.name]),
        address: (o.properties || []).map((p) => p.address).join(", "),
      });
      to = o.email ? [o.email] : [];
    }
  }
  return { values, to, ids };
}

export function fillTemplate(text, values) {
  return String(text || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => (values[k] !== undefined ? String(values[k]) : ""));
}
