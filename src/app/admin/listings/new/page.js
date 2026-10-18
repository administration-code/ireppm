import StaffGate from "@/components/admin/StaffGate";
import ListingForm from "@/components/admin/ListingForm";
import ListingFromUnit from "@/components/admin/ListingFromUnit";

export const metadata = { title: "New Listing" };

export default async function NewListingPage({ searchParams }) {
  const { unit } = await searchParams;
  const unitId = typeof unit === "string" && /^[0-9a-f-]{36}$/i.test(unit) ? unit : null;
  return <StaffGate>{unitId ? <ListingFromUnit unitId={unitId} /> : <ListingForm />}</StaffGate>;
}
