import StaffGate from "@/components/admin/StaffGate";
import ServiceVisits from "@/components/admin/ServiceVisits";

export const metadata = { title: "Lawn and Snow Visits" };

export default function Page() {
  return (
    <StaffGate>
      <ServiceVisits />
    </StaffGate>
  );
}
