import StaffGate from "@/components/admin/StaffGate";
import InsuranceReview from "@/components/InsuranceReview";

export const metadata = { title: "Tenant Insurance" };

export default function InsurancePage() {
  return (
    <StaffGate>
      <div className="stack">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="admin-title">Tenant Insurance</h1>
          <p className="small">Tenants upload proof within a week of the lease start. Landlords can review too; either approval counts.</p>
        </div>
        <InsuranceReview mode="staff" />
      </div>
    </StaffGate>
  );
}
