import StaffGate from "@/components/admin/StaffGate";
import DepositsLeasing from "@/components/admin/accounting/DepositsLeasing";

export const metadata = { title: "Deposits & Leasing" };

export default function DepositsLeasingPage() {
  return (
    <StaffGate>
      <DepositsLeasing />
    </StaffGate>
  );
}
