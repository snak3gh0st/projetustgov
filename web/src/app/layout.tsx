import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import NewsBanner from '@/components/NewsBanner'
import NotificationBell from '@/components/NotificationBell'
import { auth } from '@/lib/auth'
import Providers from '@/components/Providers'

export const metadata: Metadata = {
  title: 'Hub da Projetos',
  description: 'Hub da Projetos — gestão de instrumentos governamentais',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-body">
        <Providers>
          {session?.user && (
            <Sidebar
              user={{
                name: session.user.name,
                role: session.user.role as 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista' | 'coord_execucao' | 'assistente_execucao' | 'coord_prestacao' | 'assistente_prestacao',
                email: session.user.email,
              }}
            />
          )}
          <main className={session ? "ml-56 min-h-screen p-6" : "min-h-screen p-6"}>
            {session?.user && <NewsBanner />}
            {session?.user && ['gestor', 'admin', 'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_execucao', 'assistente_execucao', 'coord_prestacao', 'assistente_prestacao'].includes(
              session.user.role as string
            ) && (
              <div className="flex justify-end mb-2">
                <NotificationBell />
              </div>
            )}
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
