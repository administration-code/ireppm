import StaffGate from "@/components/admin/StaffGate";
import WorkOrderInvoice from "@/components/WorkOrderInvoice";

export const metadata = { title: "Work Order Invoice" };

export default async function StaffWorkOrderInvoicePage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <WorkOrderInvoice id={id} backHref={`/admin/maintenance/${id}`} backLabel="Back to the work order" staff />
    </StaffGate>
  );
}
