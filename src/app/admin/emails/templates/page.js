import StaffGate from "@/components/admin/StaffGate";
import TemplatesEditor from "@/components/admin/emails/TemplatesEditor";

export const metadata = { title: "Email Templates" };

export default function Page() {
  return (
    <StaffGate>
      <TemplatesEditor />
    </StaffGate>
  );
}
