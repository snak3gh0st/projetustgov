import { Suspense } from 'react'
import ClientesClient from './ClientesClient'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClientesClient />
    </Suspense>
  )
}
