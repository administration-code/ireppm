import Link from "next/link";
import StaffGate from "@/components/admin/StaffGate";
import BreachRecord from "@/components/admin/BreachRecord";

export const metadata = { title: "Privacy Breach Record" };

export default function PrivacyBreachesPage() {
  return (
    <StaffGate>
      <div className="stack">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="admin-title">Privacy Breach Record</h1>
          <p className="small">
            Every breach of personal information, however small, logged the day we find it and kept for at least 24
            months (PIPEDA). Steps to follow are in the <Link href="/admin/workflow#breach">Staff Workflow</Link>. Privacy
            Officer: administration@ireppm.ca.
          </p>
        </div>
        <BreachRecord />
      </div>
    </StaffGate>
  );
}
