import StaffGate from "@/components/admin/StaffGate";
import InspectionReportDetail from "@/components/admin/InspectionReportDetail";

export const metadata = { title: "Inspection Report" };

export default async function InspectionReportPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <InspectionReportDetail id={id} />
    </StaffGate>
  );
}
