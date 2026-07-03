import './globals.css'
import type { Metadata } from 'next'
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google'

const heading = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-heading',
})

const body = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-body',
})

export const metadata: Metadata = {
  title: 'Capte Recursos',
  description: 'Plataforma de cursos e mentorias da Capte Recursos',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${heading.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  )
}
