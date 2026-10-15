import Link from "next/link";
import StaffGate from "@/components/admin/StaffGate";
import PartnerForm from "@/components/admin/PartnerForm";

export const metadata = { title: "Add partner" };

export default function NewPartnerPage() {
  return (
    <StaffGate>
      <div className="stack" style={{ gap: 24 }}>
        <div>
          <Link className="back" href="/admin/partners">
            ← All partners
          </Link>
          <span className="eyebrow">Staff · Partner</span>
          <h1 className="admin-title">Add partner</h1>
        </div>
        <PartnerForm />
      </div>
    </StaffGate>
  );
}
