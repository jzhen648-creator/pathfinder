import Link from "next/link";
import { redirect } from "next/navigation";

export default function Home() {
  if (process.env.NODE_ENV === "production") {
    redirect("/tree");
  }

  return (
    <main>
      <h1>Pathfinder (development)</h1>
      <p>Production <code>/</code> redirects to <Link href="/tree">/tree</Link>.</p>

      <h2>App</h2>
      <ul>
        <li>
          <Link href="/tree">/tree</Link> (default home)
        </li>
        <li>
          <Link href="/roadmap">/roadmap</Link>
        </li>
        <li>
          <Link href="/next-steps">/next-steps</Link>
        </li>
        <li>
          <Link href="/life-map">/life-map</Link> (classic canvas)
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
