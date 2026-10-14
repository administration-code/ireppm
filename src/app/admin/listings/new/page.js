import StaffGate from "@/components/admin/StaffGate";
import ListingForm from "@/components/admin/ListingForm";

export const metadata = { title: "New listing" };

export default function NewListingPage() {
  return (
    <StaffGate>
      <ListingForm />
    </StaffGate>
  );
}
