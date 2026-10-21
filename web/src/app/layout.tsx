import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import NewsBanner from '@/components/NewsBanner'
import NotificationBell from '@/components/NotificationBell'
import { auth } from '@/lib/auth'
import { cookies } from 'next/headers'
import Providers from '@/components/Providers'
import MobileDrawer from '@/components/MobileDrawer'
import { AREA_COOKIE, sidebarWidthClass } from '@/lib/areas'
import type { Role } from '@/lib/roles'

const inter = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' })
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-heading',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Projete',
  description: 'Projete, o hub da PROJETUS para gestão de instrumentos governamentais',
}

const BELL_ROLES = ['diretoria', 'admin', 'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_execucao', 'assistente_execucao', 'coord_prestacao', 'assistente_prestacao']

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const cookieStore = cookies()
  const sidebarOpen = cookieStore.get('sidebar:state')?.value !== 'false'
  const preferredArea = cookieStore.get(AREA_COOKIE)?.value ?? null
  const user = session?.user
    ? { name: session.user.name, role: session.user.role as Role, email: session.user.email }
    : null
  const showBell = Boolean(user && BELL_ROLES.includes(user.role))

  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-canvas text-ink font-body">
        <Providers>
          {user && <Sidebar user={user} defaultOpen={sidebarOpen} showBell={showBell} preferredArea={preferredArea} />}
          {user && <MobileDrawer user={user} preferredArea={preferredArea} />}
          <main
            className={
              user
                ? `${sidebarWidthClass(user.role, sidebarOpen).main} min-h-screen px-3 pb-24 pt-4 sm:px-4 lg:pt-6 lg:px-6 md:pb-8 transition-[margin] duration-base ease-out-quart`
                : 'min-h-screen p-3 sm:p-4 lg:p-6'
            }
          >
            {showBell && (
              <div className="mb-2 flex justify-end md:hidden">
                <NotificationBell />
              </div>
            )}
            {user && <NewsBanner />}
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
