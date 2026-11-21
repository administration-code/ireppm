import StaffGate from "@/components/admin/StaffGate";
import EmailsList from "@/components/admin/emails/EmailsList";

export const metadata = { title: "Emails" };

export default function Page() {
  return (
    <StaffGate>
      <EmailsList />
    </StaffGate>
  );
}
