import StaffGate from "@/components/admin/StaffGate";
import ImportBoard from "@/components/admin/accounting/ImportBoard";

export const metadata = { title: "Bank imports" };

export default function BankImportPage() {
  return (
    <StaffGate>
      <ImportBoard />
    </StaffGate>
  );
}
