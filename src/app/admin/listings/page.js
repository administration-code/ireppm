import StaffGate from "@/components/admin/StaffGate";
import ListingsTable from "@/components/admin/ListingsTable";

export const metadata = { title: "Listings manager" };

export default function AdminListingsPage() {
  return (
    <StaffGate>
      <ListingsTable />
    </StaffGate>
  );
}
