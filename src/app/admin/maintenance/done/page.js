import StaffGate from "@/components/admin/StaffGate";
import JobsDone from "@/components/admin/JobsDone";

export const metadata = { title: "Jobs Done" };

export default function Page() {
  return (
    <StaffGate>
      <JobsDone />
    </StaffGate>
  );
}
