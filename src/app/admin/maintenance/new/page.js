import StaffGate from "@/components/admin/StaffGate";
import LogRequestForm from "@/components/admin/LogRequestForm";

export const metadata = { title: "Log a maintenance request" };

export default async function NewMaintenancePage({ searchParams }) {
  const { property } = await searchParams;
  return (
    <StaffGate>
      <LogRequestForm initialPropertyId={typeof property === "string" ? property : ""} />
    </StaffGate>
  );
}
