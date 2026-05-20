"use client";

import { useState } from "react";

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

type Props = {
  nodes: FinanceNode[];
};

export function FinanceReflectionCard({ nodes }: Props) {
  const [reflection, setReflection] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRequest = nodes.length > 0;

  const handleClick = async () => {
    if (!canRequest || loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/finance/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        reflection?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? `Reflection unavailable (${response.status}).`);
        return;
      }
      setReflection(data.reflection?.trim() || "");
    } catch {
      setError("Could not get your reflection. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#34D39933] bg-[#07111F] p-4 text-sm text-zinc-300">
      {reflection ? <p>{reflection}</p> : null}
      {!reflection ? (
        <p>{canRequest ? "Generate a reflection when you want one." : "Add finance pursuits to unlock your reflection."}</p>
      ) : null}
      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
      <button
        type="button"
        disabled={!canRequest || loading}
        onClick={handleClick}
        className="mt-4 rounded-lg px-3 py-2 text-xs font-medium text-[#04110B] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: "#34D399" }}
      >
        {loading ? "Getting reflection..." : "Get reflection"}
      </button>
    </div>
  );
}
