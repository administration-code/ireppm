import StaffGate from "@/components/admin/StaffGate";
import StaffDashboard from "@/components/admin/StaffDashboard";

export const metadata = { title: "Staff dashboard" };

export default function AdminPage() {
  return (
    <StaffGate>
      <StaffDashboard />
    </StaffGate>
  );
}
