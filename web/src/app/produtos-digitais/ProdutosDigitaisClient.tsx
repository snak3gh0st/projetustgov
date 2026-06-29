'use client'

import { useEffect, useMemo, useState } from 'react'

type Metrics = {
  total: number
  ativas: number
  geolocalizadas: number
  no_crm: number
  no_proponentes: number
  fora_crm: number
}

type Point = {
  uf: string
  municipio: string
  longitude: number
  latitude: number
  total: number
  ativas: number
}

type Ranked = {
  uf?: string
  nome?: string
  total: number
}

type Row = {
  cnpj: string
  razao_social: string | null
  municipio: string | null
  uf: string | null
  situacao_cadastral: string | null
  areas: string[] | null
}

type ApiData = {
  metrics: Metrics
  points: Point[]
  ufs: Ranked[]
  areas: Ranked[]
  rows: Row[]
  latestRun: { source_reference: string; finished_at: string; rows_read: number } | null
}

const EMPTY_DATA: ApiData = {
  metrics: { total: 0, ativas: 0, geolocalizadas: 0, no_crm: 0, no_proponentes: 0, fora_crm: 0 },
  points: [],
  ufs: [],
  areas: [],
  rows: [],
  latestRun: null,
}

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO']

const AREA_OPTIONS = [
  'Desenvolvimento e defesa de direitos e interesses',
  'Religião',
  'Outras atividades associativas',
  'Cultura e recreação',
  'Assistência social',
  'Educação e pesquisa',
  'Associações patronais e profissionais',
  'Saúde',
]

function number(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('pt-BR')
}

function percent(value: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sem carga'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function formatCnpj(cnpj: string) {
  const digits = cnpj.replace(/\D/g, '').padStart(14, '0')
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function StatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">{label}</p>
      <p className="mt-3 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{helper}</p>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#0072F7] focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-blue-500/20"
      >
        {children}
      </select>
    </label>
  )
}

function HeatMap({ points }: { points: Point[] }) {
  const width = 760
  const height = 560
  const lonMin = -74
  const lonMax = -34
  const latMin = -34
  const latMax = 6
  const max = Math.max(1, ...points.map((point) => point.total))

  const plotted = points.map((point) => {
    const x = ((point.longitude - lonMin) / (lonMax - lonMin)) * width
    const y = ((latMax - point.latitude) / (latMax - latMin)) * height
    return { ...point, x, y, radius: 3 + Math.sqrt(point.total / max) * 23 }
  })

  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-[#07111f] shadow-sm dark:border-gray-800">
      <div className="absolute left-4 top-4 z-10 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white backdrop-blur">
        <p className="text-xs uppercase tracking-[0.18em] text-white/50">Heatmap Brasil</p>
        <p className="text-sm font-semibold">{number(points.reduce((sum, point) => sum + point.total, 0))} OSCs nos municípios visíveis</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[360px] w-full sm:h-[520px]" role="img" aria-label="Mapa de calor com organizações por município">
        <defs>
          <radialGradient id="heat" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#facc15" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#fb7185" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mapGrid" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#0f766e" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <rect width={width} height={height} fill="url(#mapGrid)" />
        {Array.from({ length: 9 }).map((_, index) => (
          <line key={`v-${index}`} x1={(index + 1) * (width / 10)} x2={(index + 1) * (width / 10)} y1="0" y2={height} stroke="white" strokeOpacity="0.05" />
        ))}
        {Array.from({ length: 7 }).map((_, index) => (
          <line key={`h-${index}`} y1={(index + 1) * (height / 8)} y2={(index + 1) * (height / 8)} x1="0" x2={width} stroke="white" strokeOpacity="0.05" />
        ))}
        <path
          d="M170 72 C260 8 370 18 472 60 C626 123 705 247 640 391 C586 511 425 545 304 496 C190 451 93 341 113 218 C123 155 128 108 170 72Z"
          fill="#0f172a"
          opacity="0.66"
          stroke="white"
          strokeOpacity="0.12"
        />
        {plotted.map((point) => (
          <g key={`${point.uf}-${point.municipio}-${point.x}-${point.y}`}>
            <circle cx={point.x} cy={point.y} r={point.radius} fill="url(#heat)" />
            <circle cx={point.x} cy={point.y} r={Math.max(1.6, point.radius * 0.13)} fill="#e0f2fe" opacity="0.88">
              <title>{`${point.municipio}/${point.uf}: ${number(point.total)} OSCs`}</title>
            </circle>
          </g>
        ))}
      </svg>
    </div>
  )
}

function Ranking({ title, items, labelKey }: { title: string; items: Ranked[]; labelKey: 'uf' | 'nome' }) {
  const max = Math.max(1, ...items.map((item) => item.total))
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.slice(0, 8).map((item) => (
          <div key={item[labelKey] || 'sem-nome'}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-gray-700 dark:text-gray-300">{item[labelKey]}</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{number(item.total)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div className="h-full rounded-full bg-[#0072F7]" style={{ width: `${Math.max(4, (item.total / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function ProdutosDigitaisClient() {
  const [data, setData] = useState<ApiData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    uf: '',
    area: '',
    situacao: 'Ativa',
    crm: '',
    search: '',
  })

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true)
      setError('')
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value)
      })
      fetch(`/api/produtos-digitais?${params.toString()}`, { signal: AbortSignal.timeout(30000) })
        .then((response) => {
          if (!response.ok) throw new Error('Falha ao carregar Produtos Digitais')
          return response.json()
        })
        .then(setData)
        .catch((err) => setError(err.message || 'Falha ao carregar'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timeout)
  }, [filters])

  const selectedSummary = useMemo(() => {
    const bits = [
      filters.situacao || 'Todas situações',
      filters.uf || 'Brasil',
      filters.area || 'Todas áreas',
      filters.crm === 'crm' ? 'No CRM' : filters.crm === 'fora_crm' ? 'Fora do CRM' : filters.crm === 'proponentes' ? 'Em proponentes' : 'Todo MOSC',
    ]
    return bits.join(' / ')
  }, [filters])

  const metrics = data.metrics || EMPTY_DATA.metrics

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-gray-900 dark:text-gray-100">Produtos Digitais</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Mapa MOSC carregado no sigma-db para descobrir territórios, segmentos e CNPJs com potencial comercial.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <span className="text-gray-400 dark:text-gray-500">Última carga </span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{formatDate(data.latestRun?.finished_at)}</span>
        </div>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]">
          <label className="min-w-0">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Busca</span>
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="CNPJ, município ou organização"
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#0072F7] focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-blue-500/20"
            />
          </label>
          <FilterSelect label="UF" value={filters.uf} onChange={(uf) => setFilters((current) => ({ ...current, uf }))}>
            <option value="">Brasil</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </FilterSelect>
          <FilterSelect label="Área" value={filters.area} onChange={(area) => setFilters((current) => ({ ...current, area }))}>
            <option value="">Todas</option>
            {AREA_OPTIONS.map((area) => <option key={area} value={area}>{area}</option>)}
          </FilterSelect>
          <FilterSelect label="Situação" value={filters.situacao} onChange={(situacao) => setFilters((current) => ({ ...current, situacao }))}>
            <option value="">Todas</option>
            <option value="Ativa">Ativa</option>
            <option value="Inapta">Inapta</option>
            <option value="Baixada">Baixada</option>
            <option value="Suspensa">Suspensa</option>
          </FilterSelect>
          <FilterSelect label="CRM" value={filters.crm} onChange={(crm) => setFilters((current) => ({ ...current, crm }))}>
            <option value="">Todo MOSC</option>
            <option value="crm">No CRM</option>
            <option value="fora_crm">Fora do CRM</option>
            <option value="proponentes">Em proponentes</option>
          </FilterSelect>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>{selectedSummary}</span>
          <button
            type="button"
            onClick={() => setFilters({ uf: '', area: '', situacao: 'Ativa', crm: '', search: '' })}
            className="rounded border border-gray-200 px-2.5 py-1 font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Limpar filtros
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-6 ${loading ? 'opacity-60' : ''}`}>
        <StatCard label="OSCs filtradas" value={number(metrics.total)} helper={`${percent(metrics.ativas, metrics.total)} ativas`} />
        <StatCard label="Geolocalizadas" value={number(metrics.geolocalizadas)} helper={percent(metrics.geolocalizadas, metrics.total)} />
        <StatCard label="No CRM" value={number(metrics.no_crm)} helper="vendedor_projetos" />
        <StatCard label="Em proponentes" value={number(metrics.no_proponentes)} helper="base TGov atual" />
        <StatCard label="Fora do CRM" value={number(metrics.fora_crm)} helper="potencial bruto" />
        <StatCard label="Pontos no mapa" value={number(data.points.length)} helper="municípios agregados" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.5fr)]">
        <HeatMap points={data.points} />
        <div className="space-y-4">
          <Ranking title="Estados com mais OSCs" items={data.ufs} labelKey="uf" />
          <Ranking title="Áreas principais" items={data.areas} labelKey="nome" />
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Amostra do filtro</h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">40 primeiras organizações</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
            <thead className="bg-gray-50 text-xs uppercase tracking-[0.12em] text-gray-400 dark:bg-gray-950 dark:text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Organização</th>
                <th className="px-4 py-3 text-left font-semibold">CNPJ</th>
                <th className="px-4 py-3 text-left font-semibold">Local</th>
                <th className="px-4 py-3 text-left font-semibold">Situação</th>
                <th className="px-4 py-3 text-left font-semibold">Áreas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.rows.map((row) => (
                <tr key={row.cnpj} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="max-w-sm px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{row.razao_social || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-gray-500 dark:text-gray-400">{formatCnpj(row.cnpj)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">{row.municipio}/{row.uf}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                      {row.situacao_cadastral || '-'}
                    </span>
                  </td>
                  <td className="max-w-md px-4 py-3 text-gray-500 dark:text-gray-400">{row.areas?.join(', ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
