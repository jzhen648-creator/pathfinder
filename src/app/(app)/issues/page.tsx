import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { IssuesShell } from "@/components/issues/issues-shell";
import { authOptions } from "@/lib/auth";

export default async function IssuesPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  return <IssuesShell />;
}
