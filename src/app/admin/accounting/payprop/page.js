import StaffGate from "@/components/admin/StaffGate";
import PayPropBoard from "@/components/admin/accounting/PayPropBoard";

export const metadata = { title: "PayProp Reconciliation" };

export default function Page() {
  return (
    <StaffGate>
      <PayPropBoard />
    </StaffGate>
  );
}
