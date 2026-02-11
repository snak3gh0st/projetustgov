import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Login | Projetus CRM',
  description: 'Acesse o CRM de Vendas Sigma',
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-sigma-navy text-gray-200 font-body min-h-screen flex items-center justify-center">
        {children}
      </body>
    </html>
  )
}
