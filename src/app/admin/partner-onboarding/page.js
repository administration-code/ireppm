import StaffGate from "@/components/admin/StaffGate";
import PartnerOnboarding from "@/components/admin/PartnerOnboarding";

export const metadata = { title: "Chuck Onboarding" };

export default function Page() {
  return (
    <StaffGate>
      <PartnerOnboarding />
    </StaffGate>
  );
}
