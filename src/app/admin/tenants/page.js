import StaffGate from "@/components/admin/StaffGate";
import TenantsManager from "@/components/admin/TenantsManager";

export const metadata = { title: "Manage Tenants" };

export default function ManageTenantsPage() {
  return (
    <StaffGate>
      <div className="stack">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="admin-title">Manage Tenants</h1>
          <p className="small">
            Every tenant in one place. Update their details, move them to another tenancy or unassign them, and send their
            portal invitation, move-in welcome email or PayProp letter.
          </p>
        </div>
        <TenantsManager />
      </div>
    </StaffGate>
  );
}
