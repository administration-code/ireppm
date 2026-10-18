import StaffGate from "@/components/admin/StaffGate";
import InspectionReport from "@/components/admin/InspectionReport";

export const metadata = { title: "Inspection Report" };

export default async function InspectionPrintPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <InspectionReport id={id} />
    </StaffGate>
  );
}
