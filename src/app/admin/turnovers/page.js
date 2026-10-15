import StaffGate from "@/components/admin/StaffGate";
import TurnoversBoard from "@/components/admin/TurnoversBoard";

export const metadata = { title: "Turnovers" };

export default function TurnoversPage() {
  return (
    <StaffGate>
      <TurnoversBoard />
    </StaffGate>
  );
}
