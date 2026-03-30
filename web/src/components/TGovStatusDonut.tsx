'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { type TGovStatusBucket } from '@/lib/tgov'

// ---------------------------------------------------------------------------
// Professional palette — Government/Public Service executive dashboard
// UI PRO MAX: professional blue + high contrast, Minimalism style
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  'Em Execução':                           '#16a34a',  // green-600  — active
  'Em execução':                           '#16a34a',
  'Aprovado':                              '#2563eb',  // blue-600   — approved
  'Concluído':                             '#0891b2',  // cyan-600   — completed
  'Em Análise':                            '#7c3aed',  // violet-600 — in review
  'Aguardando Análise':                    '#d97706',  // amber-600  — waiting
  'Aguardando Envio do Plano de Trabalho': '#ea580c',  // orange-600 — pending submission
  'Prestação de Contas em Análise':        '#db2777',  // pink-600   — accounting review
  'Reprovado':                             '#dc2626',  // red-600    — rejected
  'Cancelado':                             '#6b7280',  // gray-500   — cancelled
  'Sem Situação':                          '#d1d5db',  // gray-300   — unknown
}

const FALLBACK_COLORS = [
  '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626',
  '#0891b2', '#ea580c', '#db2777', '#6b7280', '#0ea5e9',
]

function getStatusColor(status: string, index: number): string {
  return STATUS_COLORS[status] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

// ---------------------------------------------------------------------------
// Tooltip — clean card matching Minimalism style
// ---------------------------------------------------------------------------
function CustomTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ payload: TGovStatusBucket }>
}) {
  if (!active || !payload?.length) return null
  const { status, count } = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm pointer-events-none">
      <p className="font-semibold text-gray-900 mb-0.5 max-w-[200px] leading-snug">{status}</p>
      <p className="text-gray-500">
        <span className="font-bold text-gray-900">{count.toLocaleString('pt-BR')}</span>{' '}
        proposta{count !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface TGovStatusDonutProps {
  data: TGovStatusBucket[]
  /** Total matching main filters — used to compute percentages. */
  total: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function TGovStatusDonut({ data, total }: TGovStatusDonutProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  // UI PRO MAX: "Large slices first" for visual balance
  const sorted = [...data].sort((a, b) => b.count - a.count)

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        Sem dados para o filtro selecionado
      </div>
    )
  }

  // Center label: show hovered segment or grand total
  const active = activeIndex !== null ? sorted[activeIndex] : null
  const centerCount = active ? active.count : total
  const centerLabel = active
    ? ((active.count / total) * 100).toFixed(0) + '%'
    : 'total'

  return (
    <div className="flex items-start gap-6">

      {/* Donut + center label */}
      <div className="shrink-0 relative w-44 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={sorted}
              dataKey="count"
              nameKey="status"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={72}
              paddingAngle={2}
              stroke="none"
              onMouseEnter={(_, idx) => setActiveIndex(idx)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {sorted.map((entry, index) => (
                <Cell
                  key={entry.status}
                  fill={getStatusColor(entry.status, index)}
                  opacity={activeIndex === null || activeIndex === index ? 1 : 0.3}
                  style={{ cursor: 'pointer', transition: 'opacity 150ms ease' }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center text overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <span className="text-xl font-bold text-gray-900 leading-none tabular-nums">
            {centerCount.toLocaleString('pt-BR')}
          </span>
          <span className="text-[11px] text-gray-400 mt-1 font-medium tracking-wide uppercase">
            {centerLabel}
          </span>
        </div>
      </div>

      {/* Legend — synced with chart hover */}
      <div className="flex-1 space-y-1 mt-0.5 min-w-0">
        {sorted.map((entry, index) => {
          const pct = total > 0 ? ((entry.count / total) * 100).toFixed(1) : '0.0'
          const color = getStatusColor(entry.status, index)
          const isActive = activeIndex === index
          const isDimmed = activeIndex !== null && !isActive

          return (
            <div
              key={entry.status}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1 cursor-pointer transition-colors duration-150 hover:bg-gray-50"
              style={{ opacity: isDimmed ? 0.45 : 1, transition: 'opacity 150ms ease' }}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="shrink-0 inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: color }}
                />
                <span
                  className={`text-xs truncate transition-colors duration-150 ${isActive ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}
                  title={entry.status}
                >
                  {entry.status}
                </span>
              </div>
              <div className="shrink-0 flex items-baseline gap-1">
                <span className={`text-sm font-bold tabular-nums transition-colors duration-150 ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                  {entry.count.toLocaleString('pt-BR')}
                </span>
                <span className="text-[11px] text-gray-400 w-10 text-right tabular-nums">
                  {pct}%
                </span>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
