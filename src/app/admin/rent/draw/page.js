import { Suspense } from "react";
import StaffGate from "@/components/admin/StaffGate";
import PaypropDraw from "@/components/admin/PaypropDraw";

export const metadata = { title: "PayProp gift card draw" };

export default function DrawPage() {
  return (
    <StaffGate>
      <div className="stack">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="admin-title">Paid by the 7th &amp; PayProp draw</h1>
          <p className="small">
            Who paid in full on or before the 7th, and the monthly $100 gift card draw for tenants who paid through PayProp before the 7th.
          </p>
        </div>
        <Suspense fallback={<p className="small">Loading…</p>}>
          <PaypropDraw />
        </Suspense>
      </div>
    </StaffGate>
  );
}
