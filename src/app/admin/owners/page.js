import StaffGate from "@/components/admin/StaffGate";
import OwnersTable from "@/components/admin/OwnersTable";

export const metadata = { title: "Owners" };

export default function OwnersPage() {
  return (
    <StaffGate>
      <OwnersTable />
    </StaffGate>
  );
}
