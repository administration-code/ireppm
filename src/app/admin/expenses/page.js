import StaffGate from "@/components/admin/StaffGate";
import LandlordExpenses from "@/components/admin/LandlordExpenses";

export const metadata = { title: "Additional Expenses" };

export default function ExpensesPage() {
  return (
    <StaffGate>
      <LandlordExpenses />
    </StaffGate>
  );
}
