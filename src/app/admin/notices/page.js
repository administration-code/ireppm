import StaffGate from "@/components/admin/StaffGate";
import NoticesTable from "@/components/admin/NoticesTable";

export const metadata = { title: "Notices" };

export default function NoticesPage() {
  return (
    <StaffGate>
      <NoticesTable />
    </StaffGate>
  );
}
