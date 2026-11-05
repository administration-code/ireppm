import StaffGate from "@/components/admin/StaffGate";
import Refunds from "@/components/admin/Refunds";

export const metadata = { title: "Refunds" };

export default function RefundsPage() {
  return (
    <StaffGate>
      <Refunds />
    </StaffGate>
  );
}
