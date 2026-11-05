import { Suspense } from 'react'
import ResultadoClient from './ResultadoClient'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ResultadoClient />
    </Suspense>
  )
}
