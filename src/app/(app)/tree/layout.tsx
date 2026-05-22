export default function TreeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div style={{ minHeight: "var(--pf-app-content-height, 100vh)" }}>{children}</div>
}
