// Quem vê, usa e gerencia conversas de WhatsApp. Puro: usado nas rotas e testado sozinho.

/** Gestor comercial, diretoria e admin veem todas as conversas. */
export function seesAllConversations(role: string): boolean {
  return role === 'gestor' || role === 'diretoria' || role === 'admin'
}

/** Consultores (as suas) e a gestão (todas). Visualizador, CSM e o time TGov não usam. */
export function canUseWhatsapp(role: string): boolean {
  return role === 'vendedor' || role === 'coordenador' || seesAllConversations(role)
}

/** Direcionar, ligar a um lead e arquivar. */
export function canManageConversations(role: string): boolean {
  return seesAllConversations(role)
}

/**
 * Condição SQL das conversas visíveis. Consultor: as direcionadas a ele e as dos leads em que é dono ou closer
 * (o mesmo escopo de /api/leads). `userParam` é o placeholder do id do usuário, ex. '$1'.
 */
export function conversationScopeSql(role: string, userParam: string, alias = 'wc'): string {
  if (seesAllConversations(role)) return 'TRUE'
  if (!canUseWhatsapp(role)) return 'FALSE'
  return `(${alias}.atendente_id = ${userParam} OR ${alias}.lead_cnpj IN (
    SELECT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') FROM vendedor_projetos vp
    WHERE vp.vendedor_id = ${userParam} OR vp.closer_id = ${userParam}))`
}

/** A última mensagem é do contato e ninguém respondeu depois. */
export function aguardandoResposta(c: { ultima_recebida_em: string | null; ultima_enviada_em: string | null }): boolean {
  if (!c.ultima_recebida_em) return false
  return !c.ultima_enviada_em || new Date(c.ultima_recebida_em).getTime() > new Date(c.ultima_enviada_em).getTime()
}

/** Quem responde: o atendente direcionado; sem direcionamento, os donos do lead (que continuam vendo de todo jeito). */
export function responsavelDaConversa(c: { atendente_id: string | null }, donosDoLead: string[]): string[] {
  return c.atendente_id ? [c.atendente_id] : donosDoLead
}

/** Limite de envios por usuário numa janela deslizante (proteção do número contra bloqueio). */
export class SendLimiter {
  private readonly hits = new Map<string, number[]>()
  constructor(private readonly max: number, private readonly windowMs: number) {}

  allow(userId: string, now: number = Date.now()): boolean {
    const recent = (this.hits.get(userId) ?? []).filter((t) => now - t < this.windowMs)
    if (recent.length >= this.max) {
      this.hits.set(userId, recent)
      return false
    }
    recent.push(now)
    this.hits.set(userId, recent)
    return true
  }
}
