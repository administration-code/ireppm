import StaffGate from "@/components/admin/StaffGate";
import ReferralsBoard from "@/components/admin/ReferralsBoard";

export const metadata = { title: "Referrals" };

export default function ReferralsPage() {
  return (
    <StaffGate>
      <div className="stack">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="admin-title">Landlord Referrals</h1>
          <p className="small">Landlords who refer another landlord get a month&apos;s management fee free.</p>
        </div>
        <ReferralsBoard />
      </div>
    </StaffGate>
  );
}
