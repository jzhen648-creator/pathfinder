import { assignPursuitIconSafe } from "../src/lib/ai/assign-pursuit-icon";

async function probe(title: string) {
  const t0 = performance.now();
  const { iconName, perf } = await assignPursuitIconSafe({
    title,
    description: "",
    lifeArea: "Work",
  });
  console.log("[PERF_PROBE] icon-only", {
    title,
    iconName,
    totalMs: Math.round(performance.now() - t0),
    perf,
  });
}

async function main() {
  await probe("Zorbify the quincunx matrix");
  await probe("Gym strength training");
}

main().catch(console.error);
