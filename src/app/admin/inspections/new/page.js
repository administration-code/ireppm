import StaffGate from "@/components/admin/StaffGate";
import InspectionEditor from "@/components/admin/InspectionEditor";

export const metadata = { title: "New Inspection" };

const UUID = /^[0-9a-f-]{36}$/i;
const pick = (v) => (typeof v === "string" && UUID.test(v) ? v : null);

export default async function NewInspectionPage({ searchParams }) {
  const { unit, tenancy, turnover, kind } = await searchParams;
  const context = {
    unit: pick(unit),
    tenancy: pick(tenancy),
    turnover: pick(turnover),
    kind: typeof kind === "string" ? kind : null,
  };
  return (
    <StaffGate>
      <InspectionEditor context={context} />
    </StaffGate>
  );
}
