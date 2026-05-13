import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Prefer committed reference; fall back to Downloads when iterating locally. */
const candidates = [
  path.join(__dirname, "..", "reference", "pathfinder-icons-v2.html"),
  path.join(process.env.USERPROFILE || "", "Downloads", "pathfinder-icons-v2.html"),
];

const htmlPath = candidates.find((p) => fs.existsSync(p));
if (!htmlPath) {
  throw new Error(
    "pathfinder-icons-v2.html not found. Use reference/pathfinder-icons-v2.html in the repo or Downloads/pathfinder-icons-v2.html.",
  );
}

const outDir = path.join(__dirname, "..", "public", "dev");
const outPath = path.join(outDir, "pathfinder-icon-system.svg");

const h = fs.readFileSync(htmlPath, "utf8");
const i = h.indexOf("<svg");
const j = h.lastIndexOf("</svg>");
if (i < 0 || j < 0) throw new Error("No <svg> in HTML");
let s = h.slice(i, j + 6);

s = s.replace('width="100%"', 'width="720"');
if (!/\/xmlns=/.test(s) && !s.includes("xmlns=")) {
  s = s.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
}

const viewBoxAttr = s.match(/viewBox="([^"]+)"/)?.[1]?.trim() ?? "0 0 720 470";
const vbNums = viewBoxAttr.split(/\s+/).map(Number);
const outW = vbNums.length >= 4 ? vbNums[2] : 720;
const outH = vbNums.length >= 4 ? vbNums[3] : 470;

// Standalone <img> needs embedded text styles + explicit dimensions matching viewBox.
s = s.replace(
  /^<svg[^>]*>\r?\n/,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="${viewBoxAttr}" role="img" aria-label="Pathfinder icon system reference sheet (v2)">
  <style><![CDATA[
    text { font-family: system-ui, -apple-system, sans-serif; fill: #e8e4dc; }
    .th { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
    .tn { font-size: 10px; font-weight: 400; opacity: 0.55; }
    .tl { font-size: 9px; font-weight: 400; opacity: 0.35; }
  ]]></style>

`,
);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, s, "utf8");
console.log("Source:", htmlPath);
console.log("Wrote", outPath);
