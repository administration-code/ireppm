import StaffGate from "@/components/admin/StaffGate";
import InvoiceEditor from "@/components/admin/invoices/InvoiceEditor";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }) {
  const { id } = await params;
  return (
    <StaffGate>
      <InvoiceEditor id={id} />
    </StaffGate>
  );
}
