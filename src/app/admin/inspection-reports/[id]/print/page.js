import StaffGate from "@/components/admin/StaffGate";
import InspectionReportPrint from "@/components/admin/InspectionReportPrint";

export const metadata = { title: "Inspection Report PDF" };

export default async function InspectionReportPrintPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <InspectionReportPrint id={id} />
    </StaffGate>
  );
}
