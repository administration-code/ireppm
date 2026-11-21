import StaffGate from "@/components/admin/StaffGate";
import UnmatchedEmails from "@/components/admin/comms/UnmatchedEmails";

export const metadata = { title: "Unmatched Emails" };

export default function Page() {
  return (
    <StaffGate>
      <UnmatchedEmails />
    </StaffGate>
  );
}
