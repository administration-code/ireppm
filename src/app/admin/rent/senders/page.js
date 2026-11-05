import StaffGate from "@/components/admin/StaffGate";
import PayerRules from "@/components/admin/PayerRules";

export const metadata = { title: "Sender Rules" };

export default function PayerRulesPage() {
  return (
    <StaffGate>
      <PayerRules />
    </StaffGate>
  );
}
