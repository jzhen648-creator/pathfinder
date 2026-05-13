import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type FinanceNode = {
  id: string;
  label: string;
  year: number;
  description: string;
  practicalData?: {
    type: "income" | "savings_goal" | "debt" | "investment" | "milestone";
    amount?: number;
    currency?: string;
    targetAmount?: number;
    currentAmount?: number;
    monthlyContribution?: number;
  };
};

async function getReflection(nodes: FinanceNode[]) {
  if (nodes.length === 0) return "";
  const response = await fetch(`${process.env.NEXTAUTH_URL ?? "http://localhost:3001"}/api/finance/reflection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodes }),
    cache: "no-store",
  });
  if (!response.ok) return "";
  const data = (await response.json()) as { reflection?: string };
  return data.reflection ?? "";
}

export default async function FinanceTrackerPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const goals = await prisma.goal.findMany({
    where: { userId, lifeArea: { in: ["Money", "Money & Finance"] } },
    orderBy: { createdAt: "asc" },
  });

  const nodes: FinanceNode[] = goals.map((goal) => ({
    id: goal.id,
    label: goal.title,
    year: goal.createdAt.getFullYear(),
    description: goal.description,
    practicalData: (
      goal.roadmapJson as { practicalData?: FinanceNode["practicalData"] } | null | undefined
    )?.practicalData,
  }));

  const totalSaved = nodes.reduce(
    (sum, node) => sum + Number(node.practicalData?.currentAmount ?? 0),
    0,
  );
  const totalInvested = nodes.reduce(
    (sum, node) =>
      node.practicalData?.type === "investment"
        ? sum + Number(node.practicalData?.amount ?? 0)
        : sum,
    0,
  );

  const activeSavingsGoals = nodes.filter(
    (node) =>
      node.practicalData?.type === "savings_goal" &&
      Number(node.practicalData?.targetAmount ?? 0) > Number(node.practicalData?.currentAmount ?? 0),
  );

  const nextMilestone = [...activeSavingsGoals].sort(
    (a, b) => (a.practicalData?.targetAmount ?? Infinity) - (b.practicalData?.targetAmount ?? Infinity),
  )[0];

  const reflection = await getReflection(nodes);

  return (
    <main className="min-h-screen bg-[#040A14] px-6 py-10 text-white">
      <section className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-light text-[#34D399]" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            Money
          </h1>
          <p className="text-sm text-zinc-400" style={{ fontFamily: "DM Sans, sans-serif" }}>
            Your financial story and practical tracker
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            Your Financial Story
          </h2>
          <div className="space-y-3">
            {nodes.map((node) => (
              <article key={node.id} className="rounded-xl border border-[#34D39933] bg-[#07111F] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#A7F3D0]">{node.label}</p>
                  <p className="text-xs text-zinc-500">{node.year}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-300">{node.description}</p>
                {node.practicalData ? (
                  <p className="mt-1 text-xs text-[#6EE7B7]">
                    {node.practicalData.currency === "GBP" ? "£" : ""}
                    {Number(node.practicalData.currentAmount ?? node.practicalData.amount ?? 0).toLocaleString()}
                    {node.practicalData.targetAmount
                      ? ` / ${node.practicalData.currency === "GBP" ? "£" : ""}${Number(
                          node.practicalData.targetAmount,
                        ).toLocaleString()}`
                      : ""}
                  </p>
                ) : null}
              </article>
            ))}
            {nodes.length === 0 ? <p className="text-sm text-zinc-500">No finance story nodes yet.</p> : null}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            Active Savings Goals
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {activeSavingsGoals.map((node) => {
              const target = Number(node.practicalData?.targetAmount ?? 0);
              const current = Number(node.practicalData?.currentAmount ?? 0);
              const ratio = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
              return (
                <article key={node.id} className="rounded-xl border border-[#34D39933] bg-[#07111F] p-4">
                  <p className="text-sm text-[#A7F3D0]">{node.label}</p>
                  <div className="mt-2 h-2 rounded bg-[#0E1F2E]">
                    <div className="h-2 rounded bg-[#34D399]" style={{ width: `${ratio * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-zinc-300">
                    {node.practicalData?.currency === "GBP" ? "£" : ""}
                    {current.toLocaleString()} of{" "}
                    {node.practicalData?.currency === "GBP" ? "£" : ""}
                    {target.toLocaleString()}
                  </p>
                </article>
              );
            })}
            {activeSavingsGoals.length === 0 ? (
              <p className="text-sm text-zinc-500">No active savings goals yet.</p>
            ) : null}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            Financial Snapshot
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-[#34D39933] bg-[#07111F] p-4">
              <p className="text-xs text-zinc-500">Total Saved</p>
              <p className="text-xl text-[#A7F3D0]">£{totalSaved.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-[#34D39933] bg-[#07111F] p-4">
              <p className="text-xs text-zinc-500">Total Invested</p>
              <p className="text-xl text-[#A7F3D0]">£{totalInvested.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-[#34D39933] bg-[#07111F] p-4">
              <p className="text-xs text-zinc-500">Next Milestone</p>
              <p className="text-sm text-[#A7F3D0]">{nextMilestone?.label ?? "None yet"}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-light" style={{ fontFamily: "Cormorant Garamond, serif" }}>
            AI Financial Reflection
          </h2>
          <div className="rounded-xl border border-[#34D39933] bg-[#07111F] p-4 text-sm text-zinc-300">
            {reflection || "Add finance goals to unlock your reflection."}
          </div>
        </section>
      </section>
    </main>
  );
}
