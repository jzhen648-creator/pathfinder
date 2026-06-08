import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { PURSUIT_ICON_PREFERRED_OVERRIDES } from "@/lib/icons/pursuit-icon-overrides";

const require = createRequire(import.meta.url);

let slugList: readonly string[] | null = null;
let slugSet: ReadonlySet<string> | null = null;

/** Curated slugs when lucide.d.ts is unavailable (Vercel serverless bundle). */
function readOverrideFallbackSlugList(): string[] {
  const slugs = new Set<string>();
  for (const row of PURSUIT_ICON_PREFERRED_OVERRIDES) {
    if (row.iconSlug) slugs.add(row.iconSlug);
  }
  return [...slugs].sort();
}

function readInstalledSlugList(): string[] {
  try {
    const pkgJsonPath = require.resolve("lucide/package.json");
    const dtsPath = path.join(path.dirname(pkgJsonPath), "dist/lucide.d.ts");
    const text = fs.readFileSync(dtsPath, "utf8");
    const slugs = new Set<string>();
    for (const match of text.matchAll(/lucide\.dev\/icons\/([a-z0-9-]+)/g)) {
      slugs.add(match[1]!);
    }
    const fromPackage = [...slugs].sort();
    if (fromPackage.length > 0) return fromPackage;
  } catch (err) {
    console.warn("[enumerate-lucide-slugs] package enumeration failed, using override fallback", err);
  }
  return readOverrideFallbackSlugList();
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
