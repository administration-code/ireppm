// Builds receipt data with whichever Supabase client is passed in (staff browser client or
// the server admin client), so the printable page and the emailed copy always match.

export const RECEIPT_EXCLUDED = ["split", "ignored"];
const PAYMENT_FIELDS = "id, tenancy_id, received_on, amount, method, kind, period, status";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function issuedToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

function sortTenants(list) {
  return [...(list || [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || String(a.created_at).localeCompare(String(b.created_at))
  );
}

export function receiptParams(source) {
  const get = (k) => (typeof source.get === "function" ? source.get(k) : source[k]) || "";
  const payment = String(get("payment")).trim();
  if (payment) return { payment };
  const tenancy = String(get("tenancy")).trim();
  const from = String(get("from")).trim();
  const to = String(get("to")).trim();
  if (!tenancy || !ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return null;
  return { tenancy, from, to };
}

export async function loadReceipt(sb, params) {
  if (!params) return null;
  let payments;
  let tenancyId;

  if (params.payment) {
    const { data, error } = await sb.from("payments").select(PAYMENT_FIELDS).eq("id", params.payment).maybeSingle();
    if (error) throw new Error("load failed");
    if (!data || !data.tenancy_id || RECEIPT_EXCLUDED.includes(data.status)) return null;
    payments = [data];
    tenancyId = data.tenancy_id;
  } else {
    const { data, error } = await sb
      .from("payments")
      .select(PAYMENT_FIELDS)
      .eq("tenancy_id", params.tenancy)
      .gte("received_on", params.from)
      .lte("received_on", params.to)
      .not("status", "in", `(${RECEIPT_EXCLUDED.join(",")})`)
      .order("received_on", { ascending: true });
    if (error) throw new Error("load failed");
    payments = data || [];
    tenancyId = params.tenancy;
  }

  const { data: tenancy, error } = await sb
    .from("tenancies")
    .select(
      "id, unit:units(label, property:properties(address, city, postal_code)), tenancy_tenants(full_name, email, is_primary, created_at)"
    )
    .eq("id", tenancyId)
    .maybeSingle();
  if (error) throw new Error("load failed");
  if (!tenancy) return null;

  const tenants = sortTenants(tenancy.tenancy_tenants);
  const p = tenancy.unit?.property;
  const unitAddress = [
    [tenancy.unit?.label, p?.address].filter(Boolean).join(", "),
    [p?.city, "ON", p?.postal_code].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const number = params.payment
    ? params.payment.slice(0, 8).toUpperCase()
    : `${tenancyId.slice(0, 8)}-${params.from.replace(/-/g, "")}-${params.to.replace(/-/g, "")}`.toUpperCase();

  return {
    number,
    issued: issuedToday(),
    range: params.payment ? null : { from: params.from, to: params.to },
    tenancyId,
    tenants,
    unitAddress,
    payments,
    total: Math.round(payments.reduce((s, x) => s + Number(x.amount || 0) * 100, 0)) / 100,
  };
}
