import Link from 'next/link'
import TierBadge from './TierBadge'
import { formatCNPJ, formatCompactCurrency } from '@/lib/format'
import { calculateValueTier } from '@/lib/tiers'
import type { Lead } from '@/lib/types'

export default function RankingCard({
  lead,
  rank,
}: {
  lead: Lead
  rank: number
}) {
  const tier = calculateValueTier(
    lead.total_propostas,
    lead.valor_total_emendas,
    lead.total_convenios
  )

  return (
    <Link
      href={`/lead/${encodeURIComponent(lead.cnpj)}`}
      className="block bg-sigma-navy-card border border-white/5 rounded-xl p-4 hover:border-sigma-neon/30 transition-all hover:bg-sigma-navy-card/80"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono">#{rank}</span>
          <TierBadge tier={tier} />
        </div>
        {lead.is_existing_client && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
            CLIENTE
          </span>
        )}
      </div>
      <h3 className="text-sm font-medium text-white truncate mb-1">{lead.nome}</h3>
      <p className="text-xs text-gray-500 font-mono mb-3">{formatCNPJ(lead.cnpj)}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-gray-500">Propostas</div>
          <div className="text-sm font-medium text-white">{lead.total_propostas}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Emendas</div>
          <div className="text-sm font-medium text-sigma-neon">
            {formatCompactCurrency(lead.valor_total_emendas)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Instrumentos</div>
          <div className="text-sm font-medium text-white">{lead.total_convenios}</div>
        </div>
      </div>
    </Link>
  )
}
