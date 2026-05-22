import Link from "next/link";
import { redirect } from "next/navigation";
import { defaultAppPathForSession } from "@/lib/onboarding-gate";

export default async function Home() {
  if (process.env.NODE_ENV === "production") {
    redirect(await defaultAppPathForSession());
  }

  return (
    <main>
      <h1>Pathfinder (development)</h1>
      <p>Production <code>/</code> redirects to onboarding or the tree based on profile state.</p>

      <h2>App</h2>
      <ul>
        <li>
          <Link href="/tree">/tree</Link> (default home after onboarding)
        </li>
        <li>
          <Link href="/tasks">/tasks</Link>
        </li>
        <li>
          <Link href="/dashboard">/dashboard</Link>
        </li>
        <li>
          <Link href="/finance-tracker">/finance-tracker</Link>
        </li>
      </ul>

      <h2>Auth</h2>
      <ul>
        <li>
          <Link href="/login">/login</Link>
        </li>
        <li>
          <Link href="/onboarding">/onboarding</Link>
        </li>
      </ul>
    </main>
  );
}
