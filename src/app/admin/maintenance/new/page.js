import StaffGate from "@/components/admin/StaffGate";
import LogRequestForm from "@/components/admin/LogRequestForm";

export const metadata = { title: "Log a Maintenance Request" };

const str = (v) => (typeof v === "string" ? v : "");

export default async function NewMaintenancePage({ searchParams }) {
  const { property, unit, task, title } = await searchParams;
  return (
    <StaffGate>
      <LogRequestForm
        initialPropertyId={str(property)}
        initialUnitId={str(unit)}
        taskId={str(task)}
        initialTitle={str(title).slice(0, 120)}
      />
    </StaffGate>
  );
}
