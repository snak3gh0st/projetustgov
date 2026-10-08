import { Suspense } from 'react'
import CaixaClient from './CaixaClient'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CaixaClient />
    </Suspense>
  )
}
