import StaffGate from "@/components/admin/StaffGate";
import InspectionEditor from "@/components/admin/InspectionEditor";

export const metadata = { title: "Inspection" };

export default async function InspectionPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <InspectionEditor id={id} />
    </StaffGate>
  );
}
