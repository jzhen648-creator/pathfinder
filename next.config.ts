import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse wraps pdf.js and mammoth relies on Node streams. Leaving them to
  // Next's webpack/turbopack bundler causes runtime failures in dev. Marking
  // them as external forces Next to `require()` them at runtime from
  // node_modules, which is what the upstream libs expect.
  serverExternalPackages: ["pdf-parse", "mammoth"],
  /** Playwright and some browsers hit 127.0.0.1; without this, client HMR can fail and the tree stays on "Growing your tree…". */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async redirects() {
    return [
      {
        source: "/roadmap",
        destination: "/tree",
        permanent: false,
      },
      {
        source: "/next-steps",
        destination: "/tasks",
        permanent: false,
      },
      {
        source: "/next-steps/:path*",
        destination: "/tasks/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
