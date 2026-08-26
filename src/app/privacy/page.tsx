import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Almanac",
  description: "How Almanac collects, uses, and protects your data.",
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
        color: "#10221f",
        background: "#fbf7f0",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: "#74756f", marginBottom: 32 }}>Last updated: August 2026</p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>What we collect</h2>
        <ul style={{ paddingLeft: 20, color: "#4f544f" }}>
          <li>Account email and securely handled authentication information</li>
          <li>AI responses that you deliberately paste into Almanac</li>
          <li>Your decisions about which Updates to accept or exclude</li>
          <li>Subjects, accepted Updates, provenance and presentation preferences</li>
          <li>Limited operational diagnostics needed to keep the service reliable</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>How we use it</h2>
        <p style={{ color: "#4f544f" }}>
          Almanac stores the original responses you bring in, the decisions you make during review,
          and the resulting Subject history so you can inspect and correct it later. The current
          Almanac flow parses the transfer format deterministically and does not send your history to
          an internal Almanac AI. We do not sell your data.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Third parties</h2>
        <ul style={{ paddingLeft: 20, color: "#4f544f" }}>
          <li>
            <strong>Vercel</strong> — application and API hosting
          </li>
          <li>
            <strong>Supabase</strong> — PostgreSQL database hosting
          </li>
          <li>
            <strong>Resend</strong> — account-recovery email delivery when requested
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Retention and deletion</h2>
        <p style={{ color: "#4f544f" }}>
          You can request account deletion using the contact address below. Deletion removes your
          account-linked Almanac data, including original responses, Subjects, Updates, review
          receipts and presentation preferences, subject to operational or legal retention
          requirements that apply at the time.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Contact</h2>
        <p style={{ color: "#4f544f" }}>
          Questions about this policy:{" "}
          <a href="mailto:jzhen648@gmail.com" style={{ color: "#1f5e4d" }}>
            jzhen648@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
