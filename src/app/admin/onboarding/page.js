import StaffGate from "@/components/admin/StaffGate";
import Onboarding from "@/components/admin/onboarding/Onboarding";

export const metadata = { title: "Onboarding" };

export default function OnboardingPage() {
  return (
    <StaffGate>
      <Onboarding />
    </StaffGate>
  );
}
