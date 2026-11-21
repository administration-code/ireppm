import { Suspense } from "react";
import StaffGate from "@/components/admin/StaffGate";
import NewEmail from "@/components/admin/emails/NewEmail";

export const metadata = { title: "New Email" };

export default function Page() {
  return (
    <StaffGate>
      <Suspense fallback={<p className="small">Loading…</p>}>
        <NewEmail />
      </Suspense>
    </StaffGate>
  );
}
