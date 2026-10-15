import StaffGate from "@/components/admin/StaffGate";
import MaintenanceTable from "@/components/admin/MaintenanceTable";

export const metadata = { title: "Maintenance" };

export default function MaintenancePage() {
  return (
    <StaffGate>
      <MaintenanceTable />
    </StaffGate>
  );
}
