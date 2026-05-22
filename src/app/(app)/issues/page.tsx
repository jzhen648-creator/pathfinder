import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { IssuesShell } from "@/components/issues/issues-shell";
import { authOptions } from "@/lib/auth";

function initialsFromProfile(name: string, email: string): string {
  const n = name.trim();
  if (n.length >= 2) return (n[0] + n[1]).toUpperCase();
  if (n.length === 1) {
    const e = (email[0] ?? "?").toUpperCase();
    return `${n[0].toUpperCase()}${e}`;
  }
  const local = email.split("@")[0] ?? "";
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  if (local.length === 1) return `${local[0].toUpperCase()}P`;
  return "PF";
}

export default async function IssuesPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const name = session?.user?.name ?? "";
  const email = session?.user?.email ?? "";

  return (
    <IssuesShell
      avatarInitials={initialsFromProfile(name, email)}
      avatarTitle={name || email || "Profile"}
    />
  );
}
