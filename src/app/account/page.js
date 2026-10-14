import AccountView from "@/components/AccountView";

export const metadata = {
  title: "My profile",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <section className="block">
      <div className="wrap">
        <AccountView />
      </div>
    </section>
  );
}
