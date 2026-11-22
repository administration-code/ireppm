import StaffGate from "@/components/admin/StaffGate";
import CashBoard from "@/components/admin/accounting/CashBoard";

export const metadata = { title: "Cash from Chuck" };

export default function Page() {
  return (
    <StaffGate>
      <CashBoard />
    </StaffGate>
  );
}
