import StaffGate from "@/components/admin/StaffGate";
import PayPropBatch from "@/components/admin/PayPropBatch";

export const metadata = { title: "PayProp Batch" };

export default function PayPropPage() {
  return (
    <StaffGate>
      <PayPropBatch />
    </StaffGate>
  );
}
