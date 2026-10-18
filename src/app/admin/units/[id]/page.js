import StaffGate from "@/components/admin/StaffGate";
import UnitTenancy from "@/components/admin/UnitTenancy";

export const metadata = { title: "Unit Tenancy" };

export default async function UnitPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <UnitTenancy id={id} />
    </StaffGate>
  );
}
