import StaffGate from "@/components/admin/StaffGate";
import EmailIntakeReview from "@/components/admin/EmailIntakeReview";

export const metadata = { title: "Review email intake" };

export default function Page() {
  return (
    <StaffGate>
      <EmailIntakeReview />
    </StaffGate>
  );
}
