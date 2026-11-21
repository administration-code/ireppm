import StaffGate from "@/components/admin/StaffGate";
import TodayPage from "@/components/admin/TodayPage";

export const metadata = { title: "Today" };

export default function Today() {
  return (
    <StaffGate>
      <TodayPage />
    </StaffGate>
  );
}
