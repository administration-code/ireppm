import Link from "next/link";
import StaffGate from "@/components/admin/StaffGate";
import PropertyForm from "@/components/admin/PropertyForm";

export const metadata = { title: "Add property" };

export default function NewPropertyPage() {
  return (
    <StaffGate>
      <div className="stack" style={{ gap: 24 }}>
        <div>
          <Link className="back" href="/admin/properties">
            ← All properties
          </Link>
          <span className="eyebrow">Staff · Create</span>
          <h1 className="admin-title">Add property</h1>
        </div>
        <PropertyForm />
      </div>
    </StaffGate>
  );
}
