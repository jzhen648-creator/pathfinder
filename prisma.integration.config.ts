import { defineConfig } from "prisma/config";

const testDatabaseUrl = process.env["TEST_DATABASE_URL"]?.trim();
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration database commands.");
}

const parsedUrl = new URL(testDatabaseUrl);
const databaseName = parsedUrl.pathname.replace(/^\//, "");
const isLoopback = parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost";
if (!isLoopback || !databaseName.startsWith("almanac_import_test")) {
  throw new Error(
    "Integration database commands are restricted to a loopback almanac_import_test database.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: testDatabaseUrl,
  },
});
