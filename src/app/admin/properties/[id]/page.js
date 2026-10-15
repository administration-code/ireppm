import StaffGate from "@/components/admin/StaffGate";
import PropertyEditor from "@/components/admin/PropertyEditor";

export const metadata = { title: "Property" };

export default async function PropertyPage({ params, searchParams }) {
  const { id } = await params;
  const { owner } = await searchParams;
  return (
    <StaffGate>
      <PropertyEditor id={id} initialOwnerId={typeof owner === "string" ? owner : ""} />
    </StaffGate>
  );
}
