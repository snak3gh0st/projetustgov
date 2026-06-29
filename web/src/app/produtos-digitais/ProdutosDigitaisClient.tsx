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

const BRAZIL_MAP_PATH = 'M220.1 267.7L225.8 268.3L231.5 273.4L242.3 272.9L248.5 273.7L252.5 275.7L257.0 277.1L258.7 279.9L257.4 284.4L260.8 288.7L261.3 295.4L255.1 295.4L261.4 300.6L262.7 311.7L276.1 311.9L289.1 312.3L297.9 311.7L294.9 321.1L296.4 324.6L304.1 329.2L308.7 329.9L312.4 339.4L308.1 350.5L301.5 360.6L306.7 363.6L300.8 366.3L307.2 377.1L306.2 387.6L304.1 393.2L313.2 394.4L322.1 395.2L326.0 396.2L334.5 393.1L335.4 394.5L345.0 396.0L346.4 397.4L349.3 401.7L348.3 403.9L350.8 409.4L350.4 412.8L352.5 418.8L356.0 419.9L367.0 417.6L371.9 419.0L374.6 421.0L375.0 425.3L374.4 426.0L373.9 428.3L373.8 429.2L373.7 429.7L371.3 434.6L371.0 437.0L368.2 440.3L371.5 443.3L374.4 441.8L377.3 441.3L380.2 442.2L382.9 443.7L383.0 444.8L383.4 446.8L385.1 448.6L386.2 450.5L386.6 450.9L386.9 451.5L385.9 454.0L385.9 454.2L385.3 455.5L385.1 456.4L385.4 458.5L386.1 459.8L386.2 460.5L386.2 461.2L385.1 462.1L383.1 464.4L379.0 465.7L377.9 466.2L375.9 467.4L374.6 468.3L371.0 468.7L368.0 469.6L366.3 469.9L362.8 471.8L361.0 473.1L360.0 473.9L355.7 475.1L354.5 475.5L353.9 476.5L352.7 477.2L346.3 479.4L347.8 481.8L344.2 482.7L335.9 488.9L330.8 491.7L327.2 495.9L318.5 500.9L316.8 503.6L311.7 506.5L319.1 508.0L320.8 505.6L329.5 506.8L336.5 511.5L341.6 515.0L341.8 519.1L350.0 515.7L356.3 521.5L360.3 522.0L366.7 524.1L371.4 527.1L381.0 531.4L385.2 533.4L386.1 535.3L386.8 537.4L395.6 541.2L399.6 538.9L406.2 534.0L406.2 540.9L402.2 544.8L396.6 543.1L395.7 546.0L390.1 549.6L389.1 555.7L391.0 556.4L403.2 550.0L410.0 540.8L416.2 534.3L413.8 529.0L417.7 526.4L417.8 525.0L421.6 522.0L426.8 519.6L428.5 516.2L432.0 510.7L430.8 507.2L431.3 504.8L431.8 504.5L435.8 507.6L435.9 509.5L444.2 506.8L445.7 507.5L443.0 511.0L441.7 515.5L433.6 519.9L432.5 524.4L428.9 524.9L424.5 528.7L417.7 530.9L416.5 534.0L421.2 530.9L433.5 525.1L440.0 520.7L449.6 511.0L451.2 508.3L451.7 507.3L452.8 505.4L453.7 503.7L454.6 502.4L454.8 502.0L455.7 500.8L457.3 498.8L457.5 498.5L459.7 496.2L461.5 494.6L462.7 493.3L465.2 491.3L467.8 489.4L469.5 488.4L471.4 487.2L477.7 484.6L480.6 480.8L481.9 477.6L482.2 475.2L482.8 474.7L483.0 473.8L487.0 468.3L484.0 467.7L482.7 466.4L482.5 465.1L483.0 465.0L484.3 463.5L482.9 464.0L482.8 462.9L482.1 461.4L481.8 460.8L482.2 459.6L481.4 458.8L481.0 458.1L481.4 456.1L481.6 455.7L482.7 454.3L483.2 450.3L482.7 447.7L483.6 445.9L484.9 444.0L487.2 442.2L488.1 440.9L492.2 438.3L495.7 434.7L505.1 429.5L511.5 426.3L514.9 423.5L518.5 422.0L520.5 421.3L524.6 420.0L525.3 419.6L526.2 419.9L529.5 418.0L535.0 416.6L543.5 417.3L542.9 415.9L545.7 414.1L552.7 410.7L556.2 411.1L560.1 406.4L566.9 406.5L572.3 404.8L573.9 404.8L578.3 406.7L583.6 406.2L583.8 403.3L584.9 402.2L588.3 401.7L588.5 402.2L588.5 402.4L587.0 404.0L588.7 405.7L595.8 405.1L600.7 405.1L602.7 405.2L607.3 405.1L608.6 403.5L608.5 402.2L608.2 400.4L608.4 399.9L611.5 397.8L613.9 396.2L616.7 395.3L624.5 393.3L627.3 390.8L626.1 386.6L627.7 382.2L628.4 380.7L630.6 377.9L631.6 376.1L632.7 375.7L635.2 374.7L638.8 371.5L640.8 368.5L641.9 367.4L642.4 364.8L643.1 364.2L647.7 359.6L651.9 354.3L651.3 351.4L650.8 345.9L652.3 340.7L655.7 336.0L660.1 333.6L662.4 331.6L661.4 328.2L662.8 320.5L664.8 312.8L666.0 309.3L667.0 304.7L665.5 299.4L665.1 295.2L664.3 287.2L664.7 285.9L665.2 283.0L665.9 278.2L665.6 277.9L665.5 277.8L665.2 276.0L665.6 275.4L665.9 271.5L666.5 269.0L668.8 267.9L672.9 266.2L678.2 264.8L678.7 264.3L683.4 260.4L686.0 257.7L688.4 255.3L690.0 253.4L693.3 248.4L696.5 244.2L698.1 242.1L700.1 240.3L702.3 237.4L705.8 234.4L709.2 232.8L712.8 231.5L714.5 231.0L716.3 228.8L717.1 227.7L721.4 224.7L722.7 223.2L723.8 222.0L724.7 221.0L726.0 220.0L730.4 216.8L731.0 216.2L732.0 215.0L733.7 214.0L734.6 213.2L735.4 212.2L736.4 210.9L738.1 208.8L738.5 208.1L739.0 207.0L739.3 205.7L740.1 204.5L741.7 201.1L742.4 199.2L742.7 198.2L743.7 196.6L744.3 195.4L744.0 193.8L743.9 193.4L743.9 191.6L744.2 189.7L744.7 187.4L744.7 185.4L744.0 182.8L743.7 182.4L743.5 181.7L742.9 180.1L742.4 178.7L742.3 178.1L741.7 176.4L741.6 174.8L740.4 172.4L740.4 172.0L739.2 170.6L739.1 170.0L738.7 167.7L738.1 166.6L737.1 164.4L736.7 162.6L736.1 161.2L734.8 159.3L733.7 157.8L729.3 155.6L726.0 155.1L723.7 154.8L721.3 154.7L720.1 155.1L716.1 155.4L714.3 155.1L708.4 155.1L705.7 153.6L700.4 153.3L698.8 152.3L698.2 151.6L692.7 149.0L688.4 146.0L686.9 145.3L681.2 141.4L679.8 140.1L676.4 137.5L672.8 135.7L668.7 133.7L666.3 132.5L663.8 131.7L661.9 130.6L657.8 128.6L654.5 127.1L651.3 126.0L647.1 124.1L638.9 123.4L637.4 123.2L634.8 123.8L625.1 124.6L620.9 124.9L618.7 124.7L614.7 124.1L612.1 122.6L611.3 122.6L603.8 121.7L598.7 121.8L595.8 120.8L588.7 118.4L581.8 116.8L580.2 118.8L575.8 119.2L574.9 118.1L574.5 117.9L568.5 122.4L567.2 122.8L564.9 122.6L566.7 121.8L568.2 120.0L569.3 119.8L569.0 118.5L566.7 118.4L566.5 118.5L565.8 118.6L562.2 123.2L560.6 126.4L559.6 126.6L558.8 126.6L557.4 126.2L557.6 124.5L557.6 123.3L559.4 120.4L563.2 116.8L561.2 114.0L557.8 116.1L557.1 115.9L559.0 112.4L559.5 110.4L558.3 108.7L553.8 106.6L553.1 106.5L551.9 105.8L547.3 104.8L544.8 106.4L545.1 102.7L542.0 104.7L539.4 101.8L536.2 100.7L536.0 100.6L535.9 100.6L534.9 101.0L532.1 98.7L530.0 100.8L528.1 96.4L525.6 98.3L519.9 97.6L516.9 96.2L514.1 96.0L511.8 95.1L508.0 93.1L504.9 93.2L501.4 93.8L501.0 93.9L498.6 92.5L494.4 93.6L491.3 94.6L490.7 95.4L486.2 96.7L484.4 94.5L485.9 87.2L476.6 87.2L471.9 85.8L467.7 86.7L467.5 83.1L461.7 81.9L464.1 78.2L452.8 79.2L455.3 76.5L451.7 74.3L458.1 69.8L457.9 66.6L457.5 60.4L453.0 58.6L447.9 58.7L443.0 54.0L437.9 44.3L434.9 35.7L434.1 29.2L432.9 25.9L424.9 20.9L424.5 27.2L418.5 32.1L411.8 40.9L407.5 48.7L400.8 53.4L393.7 53.4L384.8 51.6L376.4 53.5L371.7 53.1L363.4 49.9L361.9 47.8L347.6 50.4L347.4 50.4L343.2 48.5L339.4 52.3L343.8 57.6L342.0 58.4L333.7 56.7L327.0 58.0L321.4 55.6L314.8 57.3L312.0 60.3L304.2 60.8L303.9 63.0L298.0 62.0L294.3 63.5L294.6 66.2L287.0 66.8L277.2 62.3L271.9 59.4L271.0 56.0L266.2 46.5L268.4 34.1L275.0 29.1L271.5 25.7L271.0 22.1L262.9 20.8L265.5 18.1L266.5 13.0L262.0 10.2L252.8 10.8L253.6 15.6L247.0 20.8L241.9 20.4L237.3 23.5L225.3 26.9L220.6 25.5L214.0 27.4L214.1 30.7L209.3 33.5L205.1 28.7L199.3 30.1L196.1 27.7L190.6 29.8L186.7 26.2L179.4 26.6L174.6 25.6L186.5 35.1L185.8 40.7L189.7 44.6L190.8 49.4L202.2 50.6L201.9 53.0L193.2 56.4L188.8 57.0L188.8 60.5L182.4 64.5L182.4 62.6L175.5 66.8L174.4 66.1L167.9 70.7L164.7 71.0L162.6 74.3L159.9 69.9L152.7 72.7L146.0 73.7L135.7 66.8L131.3 67.7L131.1 59.7L127.7 57.7L125.6 52.6L115.1 58.4L111.3 56.2L111.0 59.8L78.9 60.1L78.9 68.9L88.9 68.8L92.3 71.6L92.8 75.0L75.1 76.1L75.1 83.0L74.9 86.6L83.4 91.2L83.1 94.5L87.0 98.0L86.8 103.4L83.3 118.2L79.1 135.6L76.9 143.8L73.5 143.9L70.4 142.2L61.6 142.2L58.2 145.4L51.9 145.4L45.3 147.4L42.2 146.8L21.1 156.3L19.7 163.2L14.2 170.0L16.9 173.7L15.0 176.1L6.8 178.7L3.8 183.6L5.7 186.1L0.3 189.9L5.8 192.8L7.0 196.8L8.8 200.8L12.7 202.7L16.6 206.8L20.1 211.0L15.0 215.8L24.3 215.8L31.5 217.1L35.1 221.2L34.6 224.0L49.8 224.0L55.5 221.6L65.2 216.1L66.0 220.0L64.2 225.1L64.2 230.0L64.2 233.9L64.2 238.0L72.9 238.6L77.3 236.9L87.0 237.0L99.8 238.3L100.4 240.0L106.6 238.6L114.0 233.1L119.6 233.8L122.2 231.1L133.0 227.2L140.1 222.6L152.3 221.3L160.5 221.6L162.6 219.4L164.7 223.2L165.5 227.1L163.8 230.0L164.1 235.2L166.2 237.8L164.1 240.1L167.1 248.5L169.3 247.9L170.5 252.0L174.0 252.1L178.7 255.0L182.3 258.3L190.7 259.4L196.0 258.3L203.3 261.5L207.3 260.9L211.0 264.0L220.1 267.7ZM390.8 451.9L390.8 451.9L390.8 451.9L390.8 451.9ZM429.0 293.9L435.0 293.0L430.6 293.7L430.3 293.9L429.0 293.9ZM560.9 122.2L558.9 123.4L557.9 125.7L560.9 125.4L560.9 122.2ZM576.3 406.7L576.3 406.6L573.9 406.9L573.9 406.9L576.3 406.7ZM386.6 438.9L387.1 438.8L387.1 438.9L386.6 438.9ZM391.8 409.4L391.8 409.4L391.9 409.4L391.8 409.4Z'

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
    return { ...point, x, y, radius: 2.2 + Math.sqrt(point.total / max) * 13 }
  }).filter((point) => point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height)
    .sort((a, b) => a.total - b.total)

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
          <clipPath id="brazilMapClip">
            <path d={BRAZIL_MAP_PATH} />
          </clipPath>
        </defs>
        <rect width={width} height={height} fill="#07111f" />
        {Array.from({ length: 9 }).map((_, index) => (
          <line key={`v-${index}`} x1={(index + 1) * (width / 10)} x2={(index + 1) * (width / 10)} y1="0" y2={height} stroke="white" strokeOpacity="0.05" />
        ))}
        {Array.from({ length: 7 }).map((_, index) => (
          <line key={`h-${index}`} y1={(index + 1) * (height / 8)} y2={(index + 1) * (height / 8)} x1="0" x2={width} stroke="white" strokeOpacity="0.05" />
        ))}
        <path
          d={BRAZIL_MAP_PATH}
          fill="#0f172a"
          opacity="0.9"
          stroke="white"
          strokeOpacity="0.22"
        />
        <g clipPath="url(#brazilMapClip)">
          {plotted.map((point) => (
            <g key={`${point.uf}-${point.municipio}-${point.x}-${point.y}`}>
              <circle cx={point.x} cy={point.y} r={point.radius} fill="url(#heat)" />
              <circle cx={point.x} cy={point.y} r={Math.max(1.8, point.radius * 0.22)} fill="#e0f2fe" opacity="0.92">
                <title>{`${point.municipio}/${point.uf}: ${number(point.total)} OSCs`}</title>
              </circle>
            </g>
          ))}
        </g>
        <path d={BRAZIL_MAP_PATH} fill="none" stroke="#bae6fd" strokeOpacity="0.42" strokeWidth="1.2" />
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
      fetch(`/api/produtos-digitais?${params.toString()}`)
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
