import { execSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

const name = "20260619120000_remove_abandoned_status";
const current = readFileSync(join("prisma/migrations", name, "migration.sql"));
const git = execSync(
  `git show 1f2151a:prisma/migrations/${name}/migration.sql`,
  { encoding: "buffer" },
);

console.log("current:", sha256(current), "len", current.length);
console.log("git 1f2151a:", sha256(git), "len", git.length);
console.log("db stored:", "08ca402731fbe28b345826f52e17320ca9001bbfe617b7b05221e8ca78e28370");

const oldTaxonomy = execSync(
  "git show 7dc3a86:prisma/migrations/20260612180000_physical_taxonomy_rename_tail/migration.sql",
  { encoding: "buffer" },
);
console.log("\nold taxonomy (7dc3a86):", sha256(oldTaxonomy));
console.log("failed db taxonomy:", "04ae30bb7c4ff25393c18438d15fefaf92124367c81f8517d17ac766d4a26629");
