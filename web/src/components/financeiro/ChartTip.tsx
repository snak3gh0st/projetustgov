'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type TipRow = { name: string; value: string; color?: string; dash?: boolean; negative?: boolean }
export type TipState = { x: number; y: number; title: string; rows: TipRow[] } | null

/** Measures an element's width (for SVG charts that draw at real pixel size). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(Math.round(el.getBoundingClientRect().width))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** One floating readout: values lead, series names follow; never the only way to read a value. */
export function ChartTip({ tip }: { tip: TipState }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!tip || !ref.current) return
    const { offsetWidth: w, offsetHeight: h } = ref.current
    let left = tip.x + 16
    let top = tip.y - h - 12
    if (left + w > window.innerWidth - 8) left = tip.x - w - 16
    if (top < 8) top = tip.y + 16
    setPos({ left: Math.max(8, left), top })
  }, [tip])

  if (!tip) return null
  return (
    <div
      ref={ref}
      role="status"
      className="pointer-events-none fixed z-[70] min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs shadow-md dark:border-gray-700 dark:bg-gray-900"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      <div className="mb-1.5 font-semibold text-slate-900 dark:text-gray-100">{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 py-px text-slate-600 dark:text-gray-300">
          <span
            className="block w-3"
            style={r.color ? { borderTop: `2px ${r.dash ? 'dashed' : 'solid'} ${r.color}` } : undefined}
          />
          <span>{r.name}</span>
          <b className={`font-semibold tabular-nums ${r.negative ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-gray-100'}`}>{r.value}</b>
        </div>
      ))}
    </div>
  )
}
