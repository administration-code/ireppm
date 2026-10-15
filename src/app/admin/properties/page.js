import StaffGate from "@/components/admin/StaffGate";
import PropertiesTable from "@/components/admin/PropertiesTable";

export const metadata = { title: "Properties" };

export default function PropertiesPage() {
  return (
    <StaffGate>
      <PropertiesTable />
    </StaffGate>
  );
}
