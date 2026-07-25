import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import ProjectForm from "@/components/forms/ProjectForm";
import { updateProject } from "@/app/actions";

export const metadata = { title: "Edit Project" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.query.projects.findFirst({ where: eq(s.projects.id, Number(id)) });
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · ${project.name}`} />
      <ProjectForm action={updateProject} project={project} />
    </div>
  );
}
