'use client'

import { ThemeProvider } from 'next-themes'
import { LazyMotion, MotionConfig, domMax } from 'motion/react'
import { ToastProvider } from '@/components/ui/Toast'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {/* Movimento: 150–280 ms, ease-out; respeita prefers-reduced-motion */}
      <LazyMotion features={domMax} strict>
        <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}>
          <ToastProvider>{children}</ToastProvider>
        </MotionConfig>
      </LazyMotion>
    </ThemeProvider>
  )
}
