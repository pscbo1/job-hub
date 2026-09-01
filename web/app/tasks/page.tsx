import { TasksExplorer } from "@/components/TasksExplorer";

export const dynamic = "force-dynamic";

export default function TasksPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-5 py-12">
      <TasksExplorer />
    </div>
  );
}
