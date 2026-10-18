export const metadata = { title: "You're Offline", robots: { index: false } };

export default function Offline() {
  return (
    <section className="block">
      <div className="wrap empty">
        <h1>You&apos;re Offline</h1>
        <p>The IRep app needs an internet connection. Check your Wi-Fi or data, then try again.</p>
        <a className="btn primary" href="/">Try Again</a>
      </div>
    </section>
  );
}
