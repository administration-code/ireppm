import StaffGate from "@/components/admin/StaffGate";
import PartnersTable from "@/components/admin/PartnersTable";

export const metadata = { title: "Partners" };

export default function PartnersPage() {
  return (
    <StaffGate>
      <PartnersTable />
    </StaffGate>
  );
}
