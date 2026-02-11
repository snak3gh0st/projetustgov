import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import { auth } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Projetus CRM | Sigma',
  description: 'Lead CRM for government instrument management',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <html lang="pt-BR">
      <body className="bg-sigma-navy text-gray-200 font-body">
        {session?.user && (
          <Sidebar
            user={{
              name: session.user.name,
              role: session.user.role as 'gestor' | 'vendedor',
              email: session.user.email,
            }}
          />
        )}
        <main className={session ? "ml-56 min-h-screen p-6" : "min-h-screen p-6"}>
          {children}
        </main>
      </body>
    </html>
  )
}
