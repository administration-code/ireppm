import StaffGate from "@/components/admin/StaffGate";
import InboxBoard from "@/components/admin/InboxBoard";

export const metadata = { title: "Inbox" };

export default function Page() {
  return (
    <StaffGate>
      <InboxBoard />
    </StaffGate>
  );
}
