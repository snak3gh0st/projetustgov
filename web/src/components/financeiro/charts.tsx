'use client'

import { useState } from 'react'
import { ChartTip, useWidth, type TipState } from './ChartTip'
import { axis, dayMonth, fullDate, money, monthLong, monthShort, pct, weekday } from './format'

/* Shared drawing helpers ------------------------------------------------ */

const C = {
  in: 'var(--fin-in)',
  inSoft: 'var(--fin-in-soft)',
  inWash: 'var(--fin-in-wash)',
  out: 'var(--fin-out)',
  outSoft: 'var(--fin-out-soft)',
  grid: 'var(--fin-grid)',
  axis: 'var(--fin-axis)',
  text: 'var(--fin-text)',
  ink: 'var(--fin-ink)',
  ink2: 'var(--fin-ink2)',
  surface: 'var(--fin-surface)',
  band: 'var(--fin-band)',
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

/** Clean ticks that always cover [lo, hi]. */
export function niceTicks(lo: number, hi: number, count: number): number[] {
  if (hi <= lo) hi = lo + 1
  const step = niceStep((hi - lo) / count)
  const out: number[] = []
  let v = Math.floor(lo / step) * step
  out.push(v)
  while (v < hi - step * 1e-6) {
    v += step
    out.push(Math.round(v * 100) / 100)
  }
  return out
}

/** Bar with a 4px rounded data end and a square base. */
function barPath(x: number, y: number, w: number, h: number, up: boolean): string {
  if (h <= 0.5) return ''
  const r = Math.min(4, h / 2, w / 2)
  return up
    ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
    : `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`
}

function YGrid({ ticks, y, left, right }: { ticks: number[]; y: (v: number) => number; left: number; right: number }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={right} y1={y(t)} y2={y(t)} style={{ stroke: t === 0 ? C.axis : C.grid }} strokeWidth={1} />
          <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} style={{ fill: C.text }}>
            {axis(t)}
          </text>
        </g>
      ))}
    </g>
  )
}

/* Balance: realized (solid) + projected (dashed) -------------------------- */

export type BalancePoint = { date: string; balance: number; projected: boolean; net?: number }

export function BalanceChart({ points, today, height = 260 }: { points: BalancePoint[]; today: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = Math.max(320, width)
  const H = height
  const L = 56
  const R = 12
  const T = 30
  const B = 26
  const iw = W - L - R
  const ih = H - T - B

  if (!points.length) return <div ref={ref} style={{ height: H }} />

  const vals = points.map((p) => p.balance)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  // Negative balances keep zero in view so the reader sees the red territory.
  const lo = min < 0 ? min * 1.05 : min * 0.85
  const hi = max > 0 ? max * 1.05 : 0
  const ticks = niceTicks(lo, hi, 4)
  const y0 = ticks[0]
  const y1 = ticks[ticks.length - 1]
  const X = (i: number) => L + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw)
  const Y = (v: number) => T + ih - ((v - y0) / (y1 - y0)) * ih
  const todayI = Math.max(0, points.findIndex((p) => p.date === today))
  const base = Y(y0 <= 0 && y1 >= 0 ? 0 : y0)

  const path = (from: number, to: number) =>
    points
      .slice(from, to + 1)
      .map((p, k) => `${k ? 'L' : 'M'}${X(from + k).toFixed(1)},${Y(p.balance).toFixed(1)}`)
      .join('')
  const realized = path(0, todayI)
  const projected = path(todayI, points.length - 1)
  const area = todayI > 0 ? `${realized}L${X(todayI).toFixed(1)},${base}L${X(0)},${base}Z` : ''

  let minI = todayI
  for (let i = todayI; i < points.length; i++) if (points[i].balance < points[minI].balance) minI = i
  const labelEvery = Math.max(1, Math.round(points.length / 6))

  function move(e: React.PointerEvent<SVGRectElement>) {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((px - L) / iw) * (points.length - 1))))
    const p = points[i]
    setHover(i)
    const rows = [{ name: p.projected ? 'Saldo previsto' : 'Saldo', value: money(p.balance), color: C.in, dash: p.projected, negative: p.balance < 0 }]
    if (p.net) rows.push({ name: p.projected ? 'Títulos do dia' : 'Movimento', value: money(p.net), color: '', dash: false, negative: p.net < 0 })
    setTip({ x: e.clientX, y: e.clientY, title: `${weekday(p.date)}, ${fullDate(p.date)}${p.date === today ? ' (hoje)' : ''}`, rows })
  }

  return (
    <div ref={ref} className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Saldo realizado e previsto por dia">
        <rect x={X(todayI)} y={T} width={Math.max(0, X(points.length - 1) - X(todayI))} height={ih} style={{ fill: C.band, opacity: 0.55 }} />
        <YGrid ticks={ticks} y={Y} left={L} right={W - R} />
        {area && <path d={area} style={{ fill: C.inWash }} />}
        {todayI > 0 && <path d={realized} fill="none" style={{ stroke: C.in }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        <path d={projected} fill="none" style={{ stroke: C.in }} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
        <line x1={X(todayI)} x2={X(todayI)} y1={T - 6} y2={T + ih} style={{ stroke: C.ink2 }} strokeWidth={1} />
        {todayI > 0 && (
          <text x={X(todayI) - 6} y={T - 12} textAnchor="end" fontSize={11} style={{ fill: C.ink2 }}>
            Realizado
          </text>
        )}
        <text x={X(todayI) + 6} y={T - 12} fontSize={11} style={{ fill: C.ink2 }}>
          Hoje · previsto a partir daqui
        </text>
        {minI - todayI > 6 && (
          <g>
            <circle cx={X(minI)} cy={Y(points[minI].balance)} r={4.5} style={{ fill: C.in, stroke: C.surface }} strokeWidth={2} />
            <text
              x={X(minI)}
              y={Y(points[minI].balance) + 20}
              textAnchor={X(minI) > W - 170 ? 'end' : 'middle'}
              fontSize={11}
              fontWeight={600}
              style={{ fill: C.ink }}
            >
              Menor saldo previsto {axis(points[minI].balance)} em {dayMonth(points[minI].date)}
            </text>
          </g>
        )}
        <circle cx={X(todayI)} cy={Y(points[todayI].balance)} r={5} style={{ fill: C.in, stroke: C.surface }} strokeWidth={2} />
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.date}
              x={X(i)}
              y={H - 6}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              fontSize={11}
              style={{ fill: C.text }}
            >
              {dayMonth(p.date)}
            </text>
          ) : null
        )}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={X(hover)} x2={X(hover)} y1={T} y2={T + ih} style={{ stroke: C.axis }} strokeWidth={1} />
            <circle cx={X(hover)} cy={Y(points[hover].balance)} r={4.5} style={{ fill: C.in, stroke: C.surface }} strokeWidth={2} />
          </g>
        )}
        <rect
          x={L}
          y={T}
          width={iw}
          height={ih}
          fill="transparent"
          className="cursor-crosshair"
          onPointerMove={move}
          onPointerLeave={() => {
            setHover(null)
            setTip(null)
          }}
        />
      </svg>
      <ChartTip tip={tip} />
    </div>
  )
}

/* Result: revenue vs costs + result strip --------------------------------- */

export function ResultChart({ months, receita, gastos, resultado }: { months: string[]; receita: number[]; gastos: number[]; resultado: number[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = Math.max(320, width)
  const H1 = 200
  const H2 = 96
  const gap = 22
  const L = 56
  const R = 10
  const T = 12
  const B = 22
  const H = T + H1 + gap + H2 + B
  const iw = W - L - R
  const band = iw / Math.max(1, months.length)
  const bw = Math.min(22, band * 0.3)

  const max = Math.max(1, ...receita, ...gastos)
  const ticks = niceTicks(0, max * 1.05, 4)
  const ymax = ticks[ticks.length - 1]
  const Y = (v: number) => T + H1 - (Math.max(0, v) / ymax) * H1

  const top2 = T + H1 + gap
  const rHi = Math.max(0, ...resultado)
  const rLo = Math.min(0, ...resultado)
  const scale = (H2 - 22) / (rHi - rLo || 1)
  const zero = top2 + 16 + rHi * scale
  const last = months.length - 1

  return (
    <div ref={ref} className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Receita bruta e custos mais despesas por mês, e resultado final por mês">
        <YGrid ticks={ticks} y={Y} left={L} right={W - R} />
        {months.map((m, i) => {
          const cx = L + band * i + band / 2
          return (
            <g key={m}>
              <path d={barPath(cx - bw - 1, Y(receita[i]), bw, T + H1 - Y(receita[i]), true)} style={{ fill: C.in }} />
              <path d={barPath(cx + 1, Y(gastos[i]), bw, T + H1 - Y(gastos[i]), true)} style={{ fill: C.out }} />
            </g>
          )
        })}
        <text x={L} y={top2 + 2} fontSize={11} style={{ fill: C.ink2 }}>
          Resultado final
        </text>
        {months.map((m, i) => {
          const cx = L + band * i + band / 2
          const v = resultado[i]
          const h = Math.abs(v) * scale
          return v >= 0 ? (
            <path key={m} d={barPath(cx - bw / 2, zero - h, bw, h, true)} style={{ fill: C.in }} />
          ) : (
            <path key={m} d={barPath(cx - bw / 2, zero, bw, h, false)} style={{ fill: C.out }} />
          )
        })}
        <line x1={L} x2={W - R} y1={zero} y2={zero} style={{ stroke: C.axis }} strokeWidth={1} />
        {last >= 0 && (
          <text
            x={L + band * last + band / 2 - bw / 2 - 6}
            y={resultado[last] >= 0 ? zero - (resultado[last] * scale) / 2 + 4 : zero + (Math.abs(resultado[last]) * scale) / 2 + 4}
            textAnchor="end"
            fontSize={11}
            fontWeight={600}
            style={{ fill: C.ink }}
          >
            {axis(resultado[last])}
          </text>
        )}
        {months.map((m, i) => (
          <text key={m} x={L + band * i + band / 2} y={H - 4} textAnchor="middle" fontSize={11} style={{ fill: C.text }}>
            {monthShort(m).split('/')[0]}
          </text>
        ))}
        {months.map((m, i) => (
          <rect
            key={m}
            x={L + band * i}
            y={T}
            width={band}
            height={H - T - B}
            fill={hover === i ? 'rgba(127,127,127,0.06)' : 'transparent'}
            onPointerMove={(e) => {
              setHover(i)
              setTip({
                x: e.clientX,
                y: e.clientY,
                title: monthLong(m),
                rows: [
                  { name: 'Receita bruta', value: money(receita[i]), color: C.in },
                  { name: 'Custos e despesas', value: money(gastos[i]), color: C.out },
                  { name: 'Resultado final', value: money(resultado[i]), negative: resultado[i] < 0 },
                  { name: 'Margem', value: receita[i] ? pct(resultado[i] / receita[i]) : '—', negative: resultado[i] < 0 },
                ],
              })
            }}
            onPointerLeave={() => {
              setHover(null)
              setTip(null)
            }}
          />
        ))}
      </svg>
      <ChartTip tip={tip} />
    </div>
  )
}

/* Cash flow: inflows above the axis, outflows mirrored below ------------- */

export type CashMonth = { mes: string; entradas: number; saidas: number; previsto: boolean }

export function CashFlowChart({ meses, height = 280 }: { meses: CashMonth[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = Math.max(320, width)
  const H = height
  const L = 56
  const R = 10
  const T = 16
  const B = 24
  const ih = H - T - B
  const half = ih / 2
  const zero = T + half
  const iw = W - L - R
  const band = iw / Math.max(1, meses.length)
  const bw = Math.min(22, band * 0.55)
  const max = Math.max(1, ...meses.map((m) => m.entradas), ...meses.map((m) => m.saidas))
  const ticks = niceTicks(0, max * 1.05, 2)
  const ymax = ticks[ticks.length - 1]
  const h = (v: number) => (Math.max(0, v) / ymax) * half
  const pStart = meses.findIndex((m) => m.previsto)

  return (
    <div ref={ref} className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Entradas acima do eixo e saídas abaixo, por mês">
        {pStart >= 0 && (
          <g>
            <rect x={L + band * pStart} y={T} width={band * (meses.length - pStart)} height={ih} style={{ fill: C.band, opacity: 0.55 }} />
            <text x={L + band * pStart + 6} y={T + 12} fontSize={11} style={{ fill: C.ink2 }}>
              Previsto
            </text>
          </g>
        )}
        {ticks
          .filter((t) => t > 0)
          .map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={zero - h(t)} y2={zero - h(t)} style={{ stroke: C.grid }} />
              <text x={L - 8} y={zero - h(t) + 4} textAnchor="end" fontSize={11} style={{ fill: C.text }}>
                {axis(t)}
              </text>
              <line x1={L} x2={W - R} y1={zero + h(t)} y2={zero + h(t)} style={{ stroke: C.grid }} />
              <text x={L - 8} y={zero + h(t) + 4} textAnchor="end" fontSize={11} style={{ fill: C.text }}>
                {axis(-t)}
              </text>
            </g>
          ))}
        {meses.map((m, i) => {
          const cx = L + band * i + band / 2
          return (
            <g key={m.mes}>
              <path d={barPath(cx - bw / 2, zero - h(m.entradas) - 1, bw, h(m.entradas), true)} style={{ fill: m.previsto ? C.inSoft : C.in }} />
              <path d={barPath(cx - bw / 2, zero + 1, bw, h(m.saidas), false)} style={{ fill: m.previsto ? C.outSoft : C.out }} />
              <text x={cx} y={H - 4} textAnchor="middle" fontSize={11} style={{ fill: C.text }}>
                {monthShort(m.mes).split('/')[0]}
              </text>
            </g>
          )
        })}
        <line x1={L} x2={W - R} y1={zero} y2={zero} style={{ stroke: C.axis }} />
        {meses.map((m, i) => (
          <rect
            key={m.mes}
            x={L + band * i}
            y={T}
            width={band}
            height={ih}
            fill={hover === i ? 'rgba(127,127,127,0.06)' : 'transparent'}
            onPointerMove={(e) => {
              setHover(i)
              const net = m.entradas - m.saidas
              setTip({
                x: e.clientX,
                y: e.clientY,
                title: `${monthLong(m.mes)}${m.previsto ? ' (previsto)' : ''}`,
                rows: [
                  { name: 'Entradas', value: money(m.entradas), color: C.in },
                  { name: 'Saídas', value: money(-m.saidas), color: C.out, negative: true },
                  { name: 'Saldo do mês', value: money(net), negative: net < 0 },
                ],
              })
            }}
            onPointerLeave={() => {
              setHover(null)
              setTip(null)
            }}
          />
        ))}
      </svg>
      <ChartTip tip={tip} />
    </div>
  )
}

/* Sparkline --------------------------------------------------------------- */

export function Sparkline({ values, width = 110, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) {
    return <span className="text-xs text-slate-500 dark:text-gray-400">Histórico em formação</span>
  }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const x = (i: number) => (i / (values.length - 1)) * (width - 6) + 3
  const y = (v: number) => height - 4 - ((v - lo) / span) * (height - 8)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" style={{ stroke: C.in }} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} style={{ fill: C.in, stroke: C.surface }} strokeWidth={2} />
    </svg>
  )
}

/* Segmented bar (aging, reconciliation) ---------------------------------- */

export type Segment = { label: string; value: number; color: string; display: string }

export function StackBar({ segments, label }: { segments: Segment[]; label: string }) {
  const [tip, setTip] = useState<TipState>(null)
  const visible = segments.filter((s) => s.value > 0)
  if (!visible.length) return <div className="my-3 h-3.5 rounded bg-slate-100 dark:bg-gray-800" aria-label={`${label}: sem valores`} />
  return (
    <div className="my-3.5 flex h-3.5 gap-0.5" role="img" aria-label={label}>
      {visible.map((s, i) => (
        <div
          key={s.label}
          className={`h-full min-w-[3px] ${i === 0 ? 'rounded-l' : ''} ${i === visible.length - 1 ? 'rounded-r' : ''}`}
          style={{ flex: s.value, background: s.color }}
          onPointerMove={(e) => setTip({ x: e.clientX, y: e.clientY, title: s.label, rows: [{ name: 'Valor', value: s.display }] })}
          onPointerLeave={() => setTip(null)}
        />
      ))}
      <ChartTip tip={tip} />
    </div>
  )
}

/* Horizontal bars (single series) ----------------------------------------- */

export function HBars({ items, color }: { items: { label: string; value: number; display: string }[]; color: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((i) => (
        <div key={i.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[13px]">
          <span className="truncate text-slate-600 dark:text-gray-300">{i.label}</span>
          <span className="tabular-nums text-slate-900 dark:text-gray-100">{i.display}</span>
          <div className="col-span-2 h-2">
            <div className="h-full rounded-r" style={{ width: `${(i.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  )
}
