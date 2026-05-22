export default function TreeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="h-full min-h-0 overflow-hidden">{children}</div>
}
