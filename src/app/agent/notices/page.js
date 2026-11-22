import AgentNotices from "@/components/agent/AgentNotices";

export const metadata = { title: "Notices to Serve", robots: { index: false, follow: false } };

export default function AgentNoticesPage() {
  return (
    <section className="block">
      <div className="wrap">
        <AgentNotices />
      </div>
    </section>
  );
}
