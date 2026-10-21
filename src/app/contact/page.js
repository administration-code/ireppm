import ContactGuide from "@/components/contact/ContactGuide";

export const metadata = {
  title: "Contact Us and Response Times",
  description:
    "How to reach IRep Property Management, how quickly we respond, urgent maintenance and emergencies, and how to pay rent.",
};

export default function ContactPage() {
  return (
    <section className="block">
      <div className="wrap stack" style={{ gap: 24, maxWidth: 960 }}>
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Contact</span>
          <h1>Contact Us and Response Times</h1>
          <p className="lead">How to reach us, how quickly we&apos;ll get back to you, and what to do when it can&apos;t wait.</p>
        </div>
        <ContactGuide audience="public" />
      </div>
    </section>
  );
}
