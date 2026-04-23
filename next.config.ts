import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse wraps pdf.js and mammoth relies on Node streams. Leaving them to
  // Next's webpack/turbopack bundler causes runtime failures in dev. Marking
  // them as external forces Next to `require()` them at runtime from
  // node_modules, which is what the upstream libs expect.
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
