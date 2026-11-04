import StaffGate from "@/components/admin/StaffGate";
import { InspectionReportsList } from "@/components/admin/InspectionReports";

export const metadata = { title: "Inspection Reports" };

export default function InspectionReportsPage() {
  return (
    <StaffGate>
      <InspectionReportsList />
    </StaffGate>
  );
}
