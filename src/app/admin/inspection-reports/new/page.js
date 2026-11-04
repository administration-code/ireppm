import StaffGate from "@/components/admin/StaffGate";
import { NewInspectionReport } from "@/components/admin/InspectionReports";

export const metadata = { title: "New Inspection Report" };

export default function NewInspectionReportPage() {
  return (
    <StaffGate>
      <NewInspectionReport />
    </StaffGate>
  );
}
