import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import NewsBanner from '@/components/NewsBanner'
import NotificationBell from '@/components/NotificationBell'
import { auth } from '@/lib/auth'
import { cookies } from 'next/headers'
import Providers from '@/components/Providers'
import MobileDrawer from '@/components/MobileDrawer'

export const metadata: Metadata = {
  title: 'Hub da PROJETUS',
  description: 'Hub da PROJETUS — gestão de instrumentos governamentais',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const cookieStore = cookies()
  const sidebarOpen = cookieStore.get('sidebar:state')?.value !== 'false'

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
              defaultOpen={sidebarOpen}
            />
          )}
          {session?.user && (
            <MobileDrawer
              user={{
                name: session.user.name,
                role: session.user.role as 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista' | 'coord_execucao' | 'assistente_execucao' | 'coord_prestacao' | 'assistente_prestacao',
                email: session.user.email,
              }}
            />
          )}
          <main className={session ? `${sidebarOpen ? 'md:ml-56' : 'md:ml-14'} min-h-screen p-6 transition-[margin] duration-200` : "min-h-screen p-6"}>
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
