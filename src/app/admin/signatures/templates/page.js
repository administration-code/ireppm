import StaffGate from "@/components/admin/StaffGate";
import TemplatesCheck from "@/components/admin/signatures/TemplatesCheck";

export const metadata = { title: "DocuSign Templates" };

export default function TemplatesPage() {
  return (
    <StaffGate>
      <TemplatesCheck />
    </StaffGate>
  );
}
