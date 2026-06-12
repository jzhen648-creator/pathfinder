import Link from "next/link";
import { MobileWebLanding } from "@/components/MobileWebLanding";
import { isProductionWeb } from "@/lib/web-landing";

export default function Home() {
  if (isProductionWeb()) {
    return <MobileWebLanding />;
  }

  return (
    <main className="min-h-full space-y-8 bg-[#0C0B10] px-6 py-12 text-[#F3EFE6]">
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="font-serif text-2xl">Pathfinder (development)</h1>
        <p className="text-sm text-[rgba(243,239,230,0.78)]">
          Production <code>/</code> shows the mobile-only landing page. API routes are available at{" "}
          <code>/api/*</code>.
        </p>
      </div>

      <div className="mx-auto max-w-lg space-y-6">
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-[rgba(243,239,230,0.52)] uppercase">Auth</h2>
          <ul className="space-y-1 text-sm">
            <li>
              <Link href="/login" className="text-[#EF9F27] hover:underline">
                /login
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
