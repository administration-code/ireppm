import StaffGate from "@/components/admin/StaffGate";
import PushSetup from "@/components/admin/PushSetup";

export const metadata = { title: "Phone Notifications" };

export default function Page() {
  return (
    <StaffGate>
      <PushSetup />
    </StaffGate>
  );
}
