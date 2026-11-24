import StaffGate from "@/components/admin/StaffGate";
import EtransferReader from "@/components/admin/EtransferReader";

export const metadata = { title: "e-Transfer Reader" };

export default function Page() {
  return (
    <StaffGate>
      <EtransferReader />
    </StaffGate>
  );
}
