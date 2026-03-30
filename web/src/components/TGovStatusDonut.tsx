'use client'

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { tgovStatusSortKey, type TGovStatusBucket } from '@/lib/tgov'

// ---------------------------------------------------------------------------
// Status colour palette — app-consistent blues/greens for known statuses,
// neutral greys for anything else.
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  'Em Execução': '#22c55e',
  'Em execução': '#22c55e',
  'Aprovado': '#3b82f6',
  'Aguardando Análise': '#f59e0b',
  'Aguardando Envio do Plano de Trabalho': '#f97316',
  'Em Análise': '#8b5cf6',
  'Reprovado': '#ef4444',
  'Cancelado': '#6b7280',
  'Concluído': '#14b8a6',
  'Prestação de Contas em Análise': '#ec4899',
  'Sem Situação': '#d1d5db',
}

const FALLBACK_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444',
  '#14b8a6', '#f97316', '#ec4899', '#6b7280', '#0ea5e9',
]

function getStatusColor(status: string, index: number): string {
  return STATUS_COLORS[status] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

interface TGovStatusDonutProps {
  data: TGovStatusBucket[]
  /** Total matching main filters — used to re-compute % when data.percent is stale. */
  total: number
}

/**
 * Donut chart for TGov situacao distribution.
 * The legend always shows absolute count and percentage without hover.
 * Statuses are sorted by TGOV_STATUS_ORDER so the legend is deterministic.
 */
export default function TGovStatusDonut({ data, total }: TGovStatusDonutProps) {
  // Sort by canonical order so legend is consistent between renders
  const sorted = [...data].sort(
    (a, b) => tgovStatusSortKey(a.status) - tgovStatusSortKey(b.status)
  )

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-sm text-gray-400">
        Sem dados para o filtro selecionado
      </div>
    )
  }

  return (
    <div className="flex items-start gap-4">
      {/* Donut */}
      <div className="shrink-0 w-40 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={sorted}
              dataKey="count"
              nameKey="status"
              cx="50%"
              cy="50%"
              innerRadius={36}
              outerRadius={62}
              paddingAngle={2}
              stroke="none"
            >
              {sorted.map((entry, index) => (
                <Cell
                  key={entry.status}
                  fill={getStatusColor(entry.status, index)}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Always-visible legend with count and percent */}
      <div className="flex-1 space-y-1.5 mt-1 min-w-0">
        {sorted.map((entry, index) => {
          const pct =
            total > 0 ? ((entry.count / total) * 100).toFixed(1) : '0.0'
          const color = getStatusColor(entry.status, index)
          return (
            <div key={entry.status} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="shrink-0 inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: color }}
                />
                <span className="text-xs text-gray-600 truncate" title={entry.status}>
                  {entry.status}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-sm font-semibold text-gray-900">
                  {entry.count.toLocaleString('pt-BR')}
                </span>
                <span className="text-xs text-gray-400 ml-1">({pct}%)</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
