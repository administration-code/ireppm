import StaffGate from "@/components/admin/StaffGate";
import MatchAudit from "@/components/admin/MatchAudit";

export const metadata = { title: "Matched By" };

export default function MatchAuditPage() {
  return (
    <StaffGate>
      <MatchAudit />
    </StaffGate>
  );
}
