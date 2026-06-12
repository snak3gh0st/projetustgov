import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Projetus Academy',
  description: 'Academy platform for Projetus courses and mentorships',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
