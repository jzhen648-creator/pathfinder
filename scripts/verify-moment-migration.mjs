/**
 * Compare backup (pre-merge) SQLite with current DB: every Moment row → Goal row + fields.
 * Run from repo root: node scripts/verify-moment-migration.mjs
 */
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const BACKUP = path.join(root, "prisma", "dev.db.backup");
const CURRENT = path.join(root, "prisma", "dev.db");

function tableExists(db, name) {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return !!row;
}

let exit = 0;
const b = new Database(BACKUP, { readonly: true });
const c = new Database(CURRENT, { readonly: true });

try {
  let momentCount = 0;
  /** @type {Array<Record<string, unknown>>} */
  let moments = [];
  if (tableExists(b, "Moment")) {
    momentCount = /** @type {{ n: number }} */ (b.prepare("SELECT COUNT(*) AS n FROM Moment").get()).n;
    moments = b
      .prepare(
        `SELECT id, label, year, month, branchId, limbId, parentMomentId, future, isTurningPoint FROM Moment`,
      )
      .all();
  }

  console.log(`Backup Moment count: ${momentCount}`);

  if (!tableExists(c, "Goal")) {
    console.error("Current DB has no Goal table");
    process.exit(1);
  }

  const goalTimelineCount = /** @type {{ n: number }} */ (
    c.prepare("SELECT COUNT(*) AS n FROM Goal WHERE goalType IN ('moment', 'event')").get()
  ).n;
  console.log(`Current Goal (moment|event) count: ${goalTimelineCount}`);

  if (momentCount !== goalTimelineCount) {
    console.error(
      `WARNING: counts differ — Moment=${momentCount} vs timeline Goals=${goalTimelineCount}`,
    );
    exit = 2;
  }

  const momentGone = !tableExists(c, "Moment");
  console.log(`Moment table dropped in current DB: ${momentGone}`);

  const stmt = c.prepare(
    `SELECT title, year, month, branchId, limbId, parentGoalId, future, isTurningPoint, goalType
     FROM Goal WHERE id = ?`,
  );

  for (const m of moments) {
    const mid = /** @type {string} */ (m.id);
    const g = stmt.get(mid);
    if (!g) {
      console.error(`MISSING Goal for Moment id=${mid}`);
      exit = 2;
      continue;
    }
    const norm = (v) => (v == null ? "" : String(v));
    const monthM = m.month == null ? 0 : Number(m.month);
    const monthG = g.month == null ? 0 : Number(g.month);
    if (
      g.title !== m.label ||
      Number(g.year) !== Number(m.year) ||
      monthG !== monthM ||
      norm(g.categoryId) !== norm(m.categoryId) ||
      norm(g.limbId) !== norm(m.limbId) ||
      norm(g.parentGoalId) !== norm(m.parentMomentId) ||
      !!g.future !== !!m.future ||
      !!g.isTurningPoint !== !!m.isTurningPoint
    ) {
      console.error(`DATA MISMATCH id=${mid}`, { moment: m, goal: g });
      exit = 2;
    }
  }

  if (exit === 0 && momentCount > 0) {
    console.log("All Moment rows have matching Goal rows with aligned fields.");
  }
} finally {
  b.close();
  c.close();
}

process.exit(exit);
