'use client'

import { createContext, useContext } from 'react'
import { linkWhatsapp } from '@/lib/whatsapp/link'

// Canal das consultorias ligado para o usuário: os botões WhatsApp abrem Conversas em vez do WhatsApp do aparelho.
const NoProjete = createContext(false)

export function WhatsappNoProjeteProvider({ ligado, children }: { ligado: boolean; children: React.ReactNode }) {
  return <NoProjete.Provider value={ligado}>{children}</NoProjete.Provider>
}

export function useLinkWhatsapp(telefone: string | null | undefined, cnpj?: string | null) {
  return linkWhatsapp(telefone, { noProjete: useContext(NoProjete), cnpj })
}

/** Para listas: um link por linha sem chamar hook dentro do map. */
export function useLinkWhatsappFn() {
  const noProjete = useContext(NoProjete)
  return (telefone: string | null | undefined, cnpj?: string | null) => linkWhatsapp(telefone, { noProjete, cnpj })
}
