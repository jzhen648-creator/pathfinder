import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

function localIpv4DevOrigins(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((networkInterface) => networkInterface.family === "IPv4" && !networkInterface.internal)
    .map((networkInterface) => networkInterface.address);
}

const nextConfig: NextConfig = {
  // pdf-parse wraps pdf.js and mammoth relies on Node streams. Leaving them to
  // Next's webpack/turbopack bundler causes runtime failures in dev. Marking
  // them as external forces Next to `require()` them at runtime from
  // node_modules, which is what the upstream libs expect.
  serverExternalPackages: ["pdf-parse", "mammoth"],
  /** Allow phones/tablets on the LAN to load dev assets; otherwise login never hydrates and forms submit as plain HTML. */
  allowedDevOrigins: ["127.0.0.1", "localhost", ...localIpv4DevOrigins()],
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
