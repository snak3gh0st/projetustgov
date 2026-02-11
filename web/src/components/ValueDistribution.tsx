'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { ValueDistribution as VD } from '@/lib/types'

const COLORS = ['#10B981', '#00D4FF', '#3B82F6', '#F59E0B', '#6B7280']

export default function ValueDistribution({ data }: { data: VD[] }) {
  return (
    <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-5">
      <h3 className="font-heading text-sm font-semibold text-white mb-4">
        Distribuicao por Faixa de Valor
      </h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
            <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
            <YAxis
              dataKey="faixa"
              type="category"
              width={180}
              tick={{ fill: '#9CA3AF', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111B2E',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#E2E8F0',
                fontSize: 12,
              }}
              formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Leads']}
            />
            <Bar dataKey="quantidade" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
