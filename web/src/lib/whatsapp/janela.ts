// Regras da janela de conversa: separador por dia e junção das páginas de mensagens. Puro.

const DIA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })

/** Dia no Brasil como dd/mm/aaaa. */
const diaSP = (d: Date) => DIA.format(d)

/** "Hoje", "Ontem" ou a data, sempre pelo dia de São Paulo. */
export function rotuloDia(iso: string, agora: Date): string {
  const dia = diaSP(new Date(iso))
  if (dia === diaSP(agora)) return 'Hoje'
  if (dia === diaSP(new Date(agora.getTime() - 86_400_000))) return 'Ontem'
  return dia
}

/** Junta páginas de mensagens por id (a versão de `novas` vale), em ordem de envio. */
export function juntarMensagens<T extends { id: number; enviada_em: string }>(atuais: T[], novas: T[]): T[] {
  const porId = new Map<number, T>()
  for (const m of atuais) porId.set(Number(m.id), m)
  for (const m of novas) porId.set(Number(m.id), m)
  return Array.from(porId.values()).sort((a, b) => Date.parse(a.enviada_em) - Date.parse(b.enviada_em) || Number(a.id) - Number(b.id))
}
