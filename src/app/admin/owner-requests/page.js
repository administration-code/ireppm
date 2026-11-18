import StaffGate from "@/components/admin/StaffGate";
import OwnerRequests from "@/components/admin/OwnerRequests";

export const metadata = { title: "Owner Requests" };

export default function OwnerRequestsPage() {
  return (
    <StaffGate>
      <OwnerRequests />
    </StaffGate>
  );
}
