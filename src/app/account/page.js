import Link from "next/link";
import AccountView from "@/components/AccountView";

export const metadata = {
  title: "My Profile",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <section className="block">
      <div className="wrap">
        <AccountView />
        <p className="pmuted small" style={{ marginTop: 32 }}>
          Renting from us? <Link href="/reviews?who=tenant#write">Tell others what it&apos;s like</Link>.
        </p>
      </div>
    </section>
  );
}
