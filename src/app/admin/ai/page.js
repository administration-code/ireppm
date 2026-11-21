import StaffGate from "@/components/admin/StaffGate";
import AiSettings from "@/components/admin/AiSettings";

export const metadata = { title: "AI Settings" };

export default function Page() {
  return (
    <StaffGate>
      <AiSettings />
    </StaffGate>
  );
}
