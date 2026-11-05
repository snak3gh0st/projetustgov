import { Suspense } from 'react'
import PagarReceberClient from './PagarReceberClient'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PagarReceberClient />
    </Suspense>
  )
}
