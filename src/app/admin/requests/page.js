import { Suspense } from "react";
import StaffGate from "@/components/admin/StaffGate";
import RequestsInbox from "@/components/admin/RequestsInbox";

export const metadata = { title: "Requests Inbox" };

export default function RequestsPage() {
  return (
    <StaffGate>
      <Suspense fallback={<p className="small">Loading requests…</p>}>
        <RequestsInbox />
      </Suspense>
    </StaffGate>
  );
}
