'use client'

import { useMemo, useState, useEffect } from 'react'

interface StateData {
  uf: string
  count: number
  saldo: number
}

// SVG paths for Brazilian states - simplified outlines
const STATE_PATHS: Record<string, { d: string; cx: number; cy: number }> = {
  AC: { d: 'M95,270 L115,265 L120,280 L105,290 Z', cx: 107, cy: 277 },
  AL: { d: 'M430,240 L445,235 L448,250 L435,252 Z', cx: 439, cy: 244 },
  AM: { d: 'M120,180 L200,170 L220,200 L200,230 L140,240 L110,220 Z', cx: 165, cy: 205 },
  AP: { d: 'M280,140 L300,130 L310,155 L290,165 Z', cx: 295, cy: 148 },
  BA: { d: 'M380,230 L430,220 L445,260 L430,300 L380,300 L370,270 Z', cx: 408, cy: 262 },
  CE: { d: 'M420,185 L445,180 L450,205 L430,210 Z', cx: 436, cy: 195 },
  DF: { d: 'M345,280 L355,278 L357,288 L347,290 Z', cx: 351, cy: 284 },
  ES: { d: 'M410,310 L425,305 L428,325 L415,330 Z', cx: 420, cy: 318 },
  GO: { d: 'M320,270 L370,265 L375,305 L340,315 L315,300 Z', cx: 345, cy: 290 },
  MA: { d: 'M340,175 L380,170 L390,200 L365,215 L340,210 Z', cx: 365, cy: 193 },
  MG: { d: 'M350,300 L410,290 L425,330 L400,355 L355,350 L340,320 Z', cx: 380, cy: 325 },
  MS: { d: 'M270,310 L320,300 L325,345 L290,365 L265,345 Z', cx: 295, cy: 333 },
  MT: { d: 'M210,240 L300,230 L315,280 L295,310 L220,315 L200,280 Z', cx: 255, cy: 275 },
  PA: { d: 'M210,150 L300,140 L320,175 L310,210 L260,220 L210,210 Z', cx: 260, cy: 180 },
  PB: { d: 'M435,215 L455,212 L458,222 L438,225 Z', cx: 447, cy: 218 },
  PE: { d: 'M415,225 L455,220 L458,237 L420,240 Z', cx: 437, cy: 230 },
  PI: { d: 'M380,195 L410,190 L415,230 L385,235 Z', cx: 397, cy: 213 },
  PR: { d: 'M290,365 L340,355 L350,380 L310,390 L285,380 Z', cx: 315, cy: 373 },
  RJ: { d: 'M385,345 L415,338 L420,355 L395,360 Z', cx: 403, cy: 350 },
  RN: { d: 'M440,200 L458,196 L460,210 L443,213 Z', cx: 450, cy: 205 },
  RO: { d: 'M160,255 L210,245 L215,280 L185,295 L155,280 Z', cx: 185, cy: 270 },
  RR: { d: 'M170,130 L200,120 L210,150 L185,160 Z', cx: 190, cy: 140 },
  RS: { d: 'M280,390 L325,385 L340,420 L310,440 L275,425 Z', cx: 305, cy: 412 },
  SC: { d: 'M310,385 L345,380 L348,400 L318,405 Z', cx: 330, cy: 393 },
  SE: { d: 'M440,250 L455,247 L457,258 L442,260 Z', cx: 449, cy: 254 },
  SP: { d: 'M330,340 L385,330 L395,360 L365,375 L325,370 Z', cx: 360, cy: 355 },
  TO: { d: 'M330,210 L370,205 L375,250 L345,260 L325,245 Z', cx: 350, cy: 232 },
}

function getColor(count: number, max: number): string {
  if (count === 0) return '#1a1f35'
  const intensity = Math.min(count / Math.max(max * 0.6, 1), 1)
  // Dark blue to neon green gradient
  const r = Math.round(16 + intensity * (0 - 16))
  const g = Math.round(31 + intensity * (255 - 31))
  const b = Math.round(53 + intensity * (136 - 53))
  return `rgb(${r},${g},${b})`
}

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `R$ ${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`
  return `R$ ${value.toFixed(0)}`
}

export default function BrazilHeatmap({ data }: { data: StateData[] }) {
  const [hoveredState, setHoveredState] = useState<string | null>(null)
  const [geoData, setGeoData] = useState<Record<string, string> | null>(null)

  // Try to load real GeoJSON
  useEffect(() => {
    fetch('/geo/br_states.json')
      .then(r => r.json())
      .then(geo => {
        if (geo?.features) {
          const paths: Record<string, string> = {}
          // We'll use the simplified paths above instead of real geo
          // since SVG path conversion from GeoJSON needs d3-geo
          setGeoData(paths)
        }
      })
      .catch(() => {})
  }, [])

  const dataMap = useMemo(() => {
    const map: Record<string, StateData> = {}
    data.forEach(d => { map[d.uf] = d })
    return map
  }, [data])

  const maxCount = useMemo(() => Math.max(...data.map(d => d.count), 1), [data])

  const hoveredData = hoveredState ? dataMap[hoveredState] : null

  return (
    <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Mapa de Convênios por Estado</h3>
          <p className="text-xs text-gray-500">{data.length} estados com projetos</p>
        </div>
        {hoveredData && (
          <div className="text-right animate-in fade-in">
            <p className="text-sm font-bold text-white">{hoveredState}</p>
            <p className="text-xs text-sigma-neon">{hoveredData.count} convênios</p>
            <p className="text-xs text-gray-400">{formatCompact(hoveredData.saldo)}</p>
          </div>
        )}
      </div>

      <svg viewBox="70 110 420 350" className="w-full h-auto" style={{ maxHeight: 350 }}>
        {/* Background */}
        <rect x="70" y="110" width="420" height="350" fill="transparent" />

        {/* States */}
        {Object.entries(STATE_PATHS).map(([uf, { d, cx, cy }]) => {
          const stateData = dataMap[uf]
          const count = stateData?.count || 0
          const isHovered = hoveredState === uf

          return (
            <g key={uf}
              onMouseEnter={() => setHoveredState(uf)}
              onMouseLeave={() => setHoveredState(null)}
              className="cursor-pointer transition-all duration-200"
            >
              <path
                d={d}
                fill={getColor(count, maxCount)}
                stroke={isHovered ? '#00ff88' : '#2a3050'}
                strokeWidth={isHovered ? 2 : 0.8}
                opacity={isHovered ? 1 : 0.9}
                className="transition-all duration-200"
              />
              <text
                x={cx}
                y={cy}
                fill={count > 0 ? '#ffffff' : '#4a5070'}
                fontSize={isHovered ? 9 : 7}
                fontWeight={isHovered ? 700 : 500}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none transition-all duration-200"
              >
                {uf}
              </text>
              {count > 0 && (
                <text
                  x={cx}
                  y={cy + 10}
                  fill="#aaaacc"
                  fontSize={6}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none select-none"
                >
                  {count}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ background: '#1a1f35' }} />
          <span>0</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ background: getColor(maxCount * 0.3, maxCount) }} />
          <span>Baixo</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ background: getColor(maxCount * 0.6, maxCount) }} />
          <span>Médio</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ background: getColor(maxCount, maxCount) }} />
          <span>Alto</span>
        </div>
      </div>
    </div>
  )
}
