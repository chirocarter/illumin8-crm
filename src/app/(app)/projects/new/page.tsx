import { PageHeader } from "@/components/ui";
import ProjectForm from "@/components/forms/ProjectForm";
import { createProject } from "@/app/actions";

export const metadata = { title: "New Project" };
export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New Project" subtitle="For work that takes weeks — partnerships, credentialing, big pushes" />
      <ProjectForm action={createProject} />
    </div>
  );
}
