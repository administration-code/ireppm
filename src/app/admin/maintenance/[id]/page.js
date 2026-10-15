import StaffGate from "@/components/admin/StaffGate";
import MaintenanceEditor from "@/components/admin/MaintenanceEditor";

export const metadata = { title: "Maintenance request" };

export default async function MaintenanceRequestPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <MaintenanceEditor id={id} />
    </StaffGate>
  );
}
