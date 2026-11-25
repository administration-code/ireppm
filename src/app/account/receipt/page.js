import TenantReceipt from "@/components/tenant/TenantReceipt";

export const metadata = { title: "Rent Receipt", robots: { index: false, follow: false } };

export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return <TenantReceipt query={new URLSearchParams(flat).toString()} />;
}
