import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Pathfinder",
  description: "How Pathfinder collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px 96px",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.6,
        color: "#e8e4dc",
        background: "#07060a",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: "#9a958c", marginBottom: 32 }}>Last updated: June 2026</p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>What we collect</h2>
        <ul style={{ paddingLeft: 20, color: "#c8c4bc" }}>
          <li>Account email and authentication credentials</li>
          <li>Profile information you enter (name, age, location, employment)</li>
          <li>Map data: pursuits, milestones, categories, and optional notes</li>
          <li>AI-generated readings and insights derived from your map</li>
          <li>Crash and error diagnostics when enabled (see Sentry below)</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>How we use it</h2>
        <p style={{ color: "#c8c4bc" }}>
          Pathfinder stores your map so you can track pursuits over time. When you pull to refresh on
          the Insights tab, we send a structured summary of your map (not a raw export of everything)
          to Google Gemini to produce theme insights and pursuit-level insight cards. We do not sell
          your data.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Third parties</h2>
        <ul style={{ paddingLeft: 20, color: "#c8c4bc" }}>
          <li>
            <strong>Google Gemini</strong> — AI reading generation when you request a sync
          </li>
          <li>
            <strong>Vercel</strong> — API hosting and database (PostgreSQL via Supabase)
          </li>
          <li>
            <strong>Sentry</strong> — optional crash reporting in mobile builds when configured
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Retention and deletion</h2>
        <p style={{ color: "#c8c4bc" }}>
          You can delete your account from Settings in the mobile app. Deletion removes your map,
          pursuits, readings, and profile from our database.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Contact</h2>
        <p style={{ color: "#c8c4bc" }}>
          Questions about this policy:{" "}
          <a href="mailto:jzhen648@gmail.com" style={{ color: "#c4a574" }}>
            jzhen648@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
