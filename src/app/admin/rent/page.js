import StaffGate from "@/components/admin/StaffGate";
import RentBoard from "@/components/admin/RentBoard";

export const metadata = { title: "Rent" };

export default function RentPage() {
  return (
    <StaffGate>
      <RentBoard />
    </StaffGate>
  );
}
