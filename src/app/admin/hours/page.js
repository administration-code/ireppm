import StaffGate from "@/components/admin/StaffGate";
import StaffHours from "@/components/admin/StaffHours";

export const metadata = { title: "Staff Hours" };

export default function StaffHoursPage() {
  return (
    <StaffGate>
      <div className="stack">
        <div style={{ display: "grid", gap: 6 }}>
          <span className="eyebrow">Staff · Hours</span>
          <h1 className="admin-title">Staff Hours</h1>
          <p className="small">Log the hours you work each day. An admin approves them for the monthly pay run.</p>
        </div>
        <StaffHours />
      </div>
    </StaffGate>
  );
}
