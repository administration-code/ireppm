import StaffGate from "@/components/admin/StaffGate";
import OpeningBalances from "@/components/admin/cutover/OpeningBalances";

export const metadata = { title: "Opening Balances" };

export default function CutoverPage() {
  return (
    <StaffGate>
      <OpeningBalances />
    </StaffGate>
  );
}
