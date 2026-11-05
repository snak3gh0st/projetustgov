import { query } from '@/lib/db'

// Quem aprovou as rubricas da proposta e quando (null = aguardando aprovação).
export interface AprovacaoRubricas {
  por: string | null
  em: string
}

export async function loadAprovacao(nrProposta: string): Promise<AprovacaoRubricas | null> {
  const rows = await query<AprovacaoRubricas>(
    `SELECT u.nome AS por, a.aprovado_em AS em
     FROM tgov_rubricas_aprovacao a
     LEFT JOIN users u ON u.id = a.aprovado_por
     WHERE a.nr_proposta = $1`,
    [nrProposta],
  )
  return rows[0] ?? null
}
