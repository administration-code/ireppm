import AgentTasks from "@/components/agent/AgentTasks";

export const metadata = { title: "Tasks From the Office", robots: { index: false, follow: false } };

export default function AgentTasksPage() {
  return (
    <section className="block">
      <div className="wrap">
        <AgentTasks />
      </div>
    </section>
  );
}
