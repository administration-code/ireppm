import Link from "next/link";
import StaffGate from "@/components/admin/StaffGate";
import PropertyForm from "@/components/admin/PropertyForm";

export const metadata = { title: "Add Property" };

export default async function NewPropertyPage({ searchParams }) {
  const { owner } = await searchParams;
  return (
    <StaffGate>
      <div className="stack" style={{ gap: 24 }}>
        <div>
          <Link className="back" href="/admin/properties">
            ← All properties
          </Link>
          <span className="eyebrow">Staff · Create</span>
          <h1 className="admin-title">Add Property</h1>
        </div>
        <PropertyForm initialOwnerId={typeof owner === "string" ? owner : ""} />
      </div>
    </StaffGate>
  );
}
