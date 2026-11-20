import StaffGate from "@/components/admin/StaffGate";
import InvoicesList from "@/components/admin/invoices/InvoicesList";

export const metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return (
    <StaffGate>
      <InvoicesList />
    </StaffGate>
  );
}
