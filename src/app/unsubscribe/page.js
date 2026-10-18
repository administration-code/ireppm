import { Suspense } from "react";
import UnsubscribeForm from "@/components/UnsubscribeForm";

export const metadata = { title: "Email Preferences", robots: { index: false } };

export default function UnsubscribePage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="prose">
          <span className="eyebrow">Email Preferences</span>
          <h1>Unsubscribe</h1>
          <Suspense fallback={<p className="small">Loading…</p>}>
            <UnsubscribeForm />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
