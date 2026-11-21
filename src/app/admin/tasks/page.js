import StaffGate from "@/components/admin/StaffGate";
import Tasks from "@/components/admin/Tasks";

export const metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <StaffGate>
      <Tasks />
    </StaffGate>
  );
}
