import StaffGate from "@/components/admin/StaffGate";
import ParallelRun from "@/components/admin/cutover/ParallelRun";

export const metadata = { title: "Parallel Run" };

export default function ParallelRunPage() {
  return (
    <StaffGate>
      <ParallelRun />
    </StaffGate>
  );
}
