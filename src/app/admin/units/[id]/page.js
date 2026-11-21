import Communications from "@/components/admin/comms/Communications";
import StaffGate from "@/components/admin/StaffGate";
import UnitTenancy from "@/components/admin/UnitTenancy";

export const metadata = { title: "Unit Tenancy" };

export default async function UnitPage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <div className="stack" style={{ gap: 32 }}>
      <UnitTenancy id={id} />
      <Communications unitId={id} />
      </div>
    </StaffGate>
  );
}
