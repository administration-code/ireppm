import StaffGate from "@/components/admin/StaffGate";
import PropertyEditor from "@/components/admin/PropertyEditor";

export const metadata = { title: "Property" };

export default async function PropertyPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <PropertyEditor id={id} />
    </StaffGate>
  );
}
