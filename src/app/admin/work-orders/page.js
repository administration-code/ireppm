import StaffGate from "@/components/admin/StaffGate";
import WorkOrdersBoard from "@/components/admin/WorkOrdersBoard";

export const metadata = { title: "Work Orders" };

export default function WorkOrdersPage() {
  return (
    <StaffGate>
      <WorkOrdersBoard />
    </StaffGate>
  );
}
