import StaffGate from "@/components/admin/StaffGate";
import PortalInvites from "@/components/admin/PortalInvites";

export const metadata = { title: "Portal invitations" };

export default function InvitesPage() {
  return (
    <StaffGate>
      <div className="stack">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="admin-title">Portal invitations</h1>
          <p className="small">Invite existing owners and tenants to sign up for their account on ireppm.ca.</p>
        </div>
        <PortalInvites />
      </div>
    </StaffGate>
  );
}
