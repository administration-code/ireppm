import Link from "next/link";
import StaffGate from "@/components/admin/StaffGate";
import OwnerForm from "@/components/admin/OwnerForm";

export const metadata = { title: "Add owner" };

export default async function NewOwnerPage({ searchParams }) {
  const { back } = await searchParams;
  return (
    <StaffGate>
      <div className="stack" style={{ gap: 24 }}>
        <div>
          <Link className="back" href="/admin/owners">
            ← All owners
          </Link>
          <span className="eyebrow">Staff · Create</span>
          <h1 className="admin-title">Add owner</h1>
        </div>
        <OwnerForm back={typeof back === "string" ? back : ""} />
      </div>
    </StaffGate>
  );
}
