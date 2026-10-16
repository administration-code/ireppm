import StaffNav from "@/components/admin/StaffNav";
import DeletedToast from "@/components/admin/DeletedToast";

export const metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function AdminLayout({ children }) {
  return (
    <section className="block admin">
      <div className="wrap">
        <StaffNav />
        {children}
        <DeletedToast />
      </div>
    </section>
  );
}
