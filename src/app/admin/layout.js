import StaffNav from "@/components/admin/StaffNav";

export const metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function AdminLayout({ children }) {
  return (
    <section className="block admin">
      <div className="wrap">
        <StaffNav />
        {children}
      </div>
    </section>
  );
}
