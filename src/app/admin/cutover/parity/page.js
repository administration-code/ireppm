import StaffGate from "@/components/admin/StaffGate";
import TrackerParity from "@/components/admin/cutover/TrackerParity";

export const metadata = { title: "Tracker Parity" };

export default function TrackerParityPage() {
  return (
    <StaffGate>
      <TrackerParity />
    </StaffGate>
  );
}
