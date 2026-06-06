import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dts = fs.readFileSync(path.join(root, "node_modules/lucide/dist/lucide.d.ts"), "utf8");
const slugs = new Set();
for (const m of dts.matchAll(/lucide\.dev\/icons\/([a-z0-9-]+)/g)) slugs.add(m[1]);
console.log("lucide", slugs.size);
