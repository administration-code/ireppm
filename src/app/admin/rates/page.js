import StaffGate from "@/components/admin/StaffGate";
import RatesEditor from "@/components/admin/RatesEditor";

export const metadata = { title: "Add-ons & rates" };

export default function RatesPage() {
  return (
    <StaffGate>
      <RatesEditor />
    </StaffGate>
  );
}
