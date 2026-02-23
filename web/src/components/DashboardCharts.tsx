'use client'

import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts'

// ─── Category Donut ───
const CAT_COLORS: Record<string, string> = {
  'PROPOSTA': '#3b82f6',
  'Ainda Não': '#ca8a04',
  'RETORNO': '#22c55e',
}

interface CatData {
  name: string
  value: number
}

export function CategoryDonut({ data }: { data: CatData[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Distribuição por Categoria</h3>
      <div className="flex items-center">
        <div className="w-32 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%" cy="50%"
                innerRadius={30}
                outerRadius={55}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={CAT_COLORS[entry.name] || '#666'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                itemStyle={{ color: '#111827' }}
                formatter={(value: number) => [`${value} (${total ? ((value/total)*100).toFixed(0) : 0}%)`, '']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2 ml-4">
          {data.map(d => (
            <div key={d.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: CAT_COLORS[d.name] }} />
                <span className="text-xs text-gray-500">{d.name}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900">{d.value}</span>
                <span className="text-xs text-gray-500 ml-1">
                  ({total ? ((d.value/total)*100).toFixed(0) : 0}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Top States Bar Chart ───
interface StateBar {
  uf: string
  count: number
  saldo: number
}

function formatCompact(value: number | string): string {
  const n = Number(value) || 0
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toFixed(0)
}

export function TopStatesChart({ data }: { data: StateBar[] }) {
  const top10 = [...data].sort((a, b) => b.saldo - a.saldo).slice(0, 10)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Top 10 Estados por Volume</h3>
      <div style={{ height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top10} layout="vertical" margin={{ left: 30, right: 10, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" tickFormatter={v => `R$${formatCompact(v)}`} tick={{ fontSize: 10, fill: '#6b7280' }} />
            <YAxis type="category" dataKey="uf" tick={{ fontSize: 11, fill: '#374151', fontWeight: 600 }} width={30} />
            <Tooltip
              contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              formatter={(value: number) => [`R$ ${formatCompact(value)}`, 'Volume']}
              labelStyle={{ color: '#111827' }}
            />
            <Bar dataKey="saldo" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {top10.map((entry, index) => (
                <Cell key={entry.uf} fill={index === 0 ? '#00ff88' : index < 3 ? '#22c55e' : '#3b82f6'} opacity={1 - index * 0.06} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Saldo Distribution (Execution %) ───
interface ExecBucket {
  range: string
  count: number
  saldo: number
}

export function ExecutionChart({ data }: { data: ExecBucket[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Distribuição por % Execução</h3>
      <p className="text-xs text-gray-500 mb-2">Quanto menor a execução, maior o saldo disponível</p>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="execGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#6b7280' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
            <Tooltip
              contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#111827' }}
              formatter={(value: number, name: string) => [name === 'count' ? `${value} convênios` : `R$ ${formatCompact(value)}`, name === 'count' ? 'Quantidade' : 'Saldo']}
            />
            <Area type="monotone" dataKey="count" stroke="#00ff88" fill="url(#execGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Vendedor Performance ───
interface VendedorPerf {
  nome: string
  projetos: number
  clientes: number
  saldo: number
  propostas: number
}

export function VendedorPerformance({ data }: { data: VendedorPerf[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Performance dos Vendedores</h3>
      <div className="space-y-3">
        {data.map((v, i) => {
          const maxSaldo = Math.max(...data.map(d => d.saldo), 1)
          const pct = (v.saldo / maxSaldo) * 100

          return (
            <div key={v.nome}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-yellow-100 text-yellow-600' :
                    i === 1 ? 'bg-gray-100 text-gray-600' :
                    'bg-orange-100 text-orange-600'
                  }`}>
                    {i + 1}
                  </div>
                  <span className="text-sm font-medium text-gray-900">{v.nome}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-[#0072F7] font-semibold">R$ {formatCompact(v.saldo)}</span>
                </div>
              </div>
              <div className="ml-8 flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: i === 0 ? '#00ff88' : i === 1 ? '#3b82f6' : i === 2 ? '#eab308' : '#8b5cf6',
                    }}
                  />
                </div>
                <div className="flex gap-3 text-xs text-gray-500 shrink-0">
                  <span>{v.clientes} clientes</span>
                  <span>{v.projetos} proj.</span>
                  <span className="text-[#0072F7]">{v.propostas} prop.</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
