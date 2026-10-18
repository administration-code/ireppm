import AppInstall from "@/components/AppInstall";

export const metadata = {
  title: "Get the App",
  description: "Install the IRep app on your phone, tablet or computer: pay rent, report repairs, book showings and see your owner statements.",
};

export default function AppPage() {
  return (
    <section className="block">
      <div className="wrap stack" style={{ gap: 28, maxWidth: 900 }}>
        <div className="head">
          <span className="eyebrow">The IRep App</span>
          <h1>IRep on Your Home Screen</h1>
          <p className="lead">
            Add IRep to your phone, tablet or computer and open it like any other app. It&apos;s free, takes a few seconds,
            and there&apos;s nothing to download from an app store.
          </p>
        </div>
        <ul className="plain-list" style={{ gap: 6 }}>
          <li><b>Tenants:</b> how to pay rent, your PayProp letter, repair requests and your documents.</li>
          <li><b>Landlords:</b> monthly statements, payouts, applicants to approve and year-end summaries.</li>
          <li><b>Renters:</b> available rentals, showing times and your applications.</li>
          <li><b>Partners and staff:</b> showings to answer and jobs to do.</li>
        </ul>
        <AppInstall />
        <p className="small">You stay signed in, and the app always shows the latest information.</p>
      </div>
    </section>
  );
}
