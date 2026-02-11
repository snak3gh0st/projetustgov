export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sigma-navy text-gray-200">
      {children}
    </div>
  )
}
