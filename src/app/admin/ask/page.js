import { Suspense } from "react";
import StaffGate from "@/components/admin/StaffGate";
import AskIRep from "@/components/admin/AskIRep";

export const metadata = { title: "Ask IRep" };

export default function Page() {
  return (
    <StaffGate>
      <Suspense fallback={<p className="small">Loading…</p>}>
        <AskIRep />
      </Suspense>
    </StaffGate>
  );
}
