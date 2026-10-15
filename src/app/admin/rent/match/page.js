import StaffGate from "@/components/admin/StaffGate";
import MatchPayments from "@/components/admin/MatchPayments";

export const metadata = { title: "Payments to match" };

export default function MatchPage() {
  return (
    <StaffGate>
      <MatchPayments />
    </StaffGate>
  );
}
