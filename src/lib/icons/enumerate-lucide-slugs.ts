import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let slugList: readonly string[] | null = null;
let slugSet: ReadonlySet<string> | null = null;

function readInstalledSlugList(): string[] {
  const pkgJsonPath = require.resolve("lucide/package.json");
  const dtsPath = path.join(path.dirname(pkgJsonPath), "dist/lucide.d.ts");
  const text = fs.readFileSync(dtsPath, "utf8");
  const slugs = new Set<string>();
  for (const match of text.matchAll(/lucide\.dev\/icons\/([a-z0-9-]+)/g)) {
    slugs.add(match[1]!);
  }
  return [...slugs].sort();
}

/** Live kebab-case slugs from installed `lucide` package (pinned to mobile lucide-react-native version). */
export function getLucideInstalledSlugs(): readonly string[] {
  if (!slugList) {
    slugList = readInstalledSlugList();
    slugSet = new Set(slugList);
  }
  return slugList;
}

export function isValidLucideSlug(slug: string): boolean {
  getLucideInstalledSlugs();
  return slugSet!.has(slug);
}

export function getLucidePackageVersion(): string {
  const pkgJsonPath = require.resolve("lucide/package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as { version?: string };
  return pkg.version ?? "unknown";
}

/** Test helper — reset cached enumeration. */
export function resetLucideSlugCacheForTests(): void {
  slugList = null;
  slugSet = null;
}
