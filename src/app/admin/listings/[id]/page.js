import StaffGate from "@/components/admin/StaffGate";
import ListingEditor from "@/components/admin/ListingEditor";

export const metadata = { title: "Edit Listing" };

export default async function EditListingPage({ params, searchParams }) {
  const { id } = await params;
  const { saved } = await searchParams;
  return (
    <StaffGate>
      <ListingEditor id={id} saved={typeof saved === "string" ? saved : undefined} />
    </StaffGate>
  );
}
