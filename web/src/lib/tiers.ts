export const TIER_COLORS = {
  HIGH: '#10B981',
  MEDIUM: '#00D4FF',
  LOW: '#6B7280',
} as const

export type Tier = keyof typeof TIER_COLORS

export function calculateValueTier(
  totalPropostas: number,
  valorEmendas: number,
  totalConvenios: number
): Tier {
  if (totalPropostas === 0) return 'HIGH'
  if (valorEmendas > 1_000_000 && totalConvenios > 0) return 'HIGH'
  if (totalPropostas <= 3 && valorEmendas >= 100_000 && valorEmendas <= 1_000_000) return 'MEDIUM'
  return 'LOW'
}

export const TIER_LABELS: Record<Tier, string> = {
  HIGH: 'Alto Valor',
  MEDIUM: 'Valor Medio',
  LOW: 'Baixo Valor',
}
