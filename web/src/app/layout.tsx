import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import NewsBanner from '@/components/NewsBanner'
import { auth } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Projetus CRM',
  description: 'CRM de Vendas para gestão de instrumentos governamentais',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <html lang="pt-BR">
      <body className="bg-gray-50 text-gray-800 font-body">
        {session?.user && (
          <Sidebar
            user={{
              name: session.user.name,
              role: session.user.role as 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto',
              email: session.user.email,
            }}
          />
        )}
        <main className={session ? "ml-56 min-h-screen p-6" : "min-h-screen p-6"}>
          {session?.user && <NewsBanner />}
          {children}
        </main>
      </body>
    </html>
  )
}
