import { redirect } from "next/navigation";

/** Old detail URL: projects now open in the right pane of /scheduler/projects. */
export default async function ProjectDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/scheduler/projects?project=${encodeURIComponent(id)}`);
}
