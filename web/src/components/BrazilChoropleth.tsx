'use client'

import { useEffect, useState } from 'react'
import type { EstadoData } from '@/lib/types'

interface GeoFeature {
  type: string
  properties: { sigla: string; nome: string }
  geometry: unknown
}

interface GeoJSON {
  type: string
  features: GeoFeature[]
}

export default function BrazilChoropleth({ data }: { data: EstadoData[] }) {
  const [geoData, setGeoData] = useState<GeoJSON | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    fetch('/geo/br_states.json')
      .then((r) => r.json())
      .then(setGeoData)
      .catch(() => {})
  }, [])

  if (!geoData) {
    return (
      <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-5 h-[420px] flex items-center justify-center">
        <span className="text-gray-500 text-sm">Carregando mapa...</span>
      </div>
    )
  }

  const maxVal = Math.max(...data.map((d) => d.total_proponentes), 1)
  const dataMap = Object.fromEntries(data.map((d) => [d.estado, d]))
  const hoveredData = hovered ? dataMap[hovered] : null

  return (
    <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-sm font-semibold text-white">
          Leads por Estado
        </h3>
        {hoveredData && (
          <div className="text-xs text-gray-300 bg-white/5 px-3 py-1 rounded-lg">
            <span className="text-sigma-neon font-semibold">{hovered}</span>
            {' — '}
            {hoveredData.total_proponentes.toLocaleString('pt-BR')} leads
            {hoveredData.total_emendas > 0 && (
              <span className="text-gray-500"> · {hoveredData.total_emendas} emendas</span>
            )}
          </div>
        )}
      </div>
      <div className="h-[340px] flex items-center justify-center">
        <svg viewBox="-75 -6 44 42" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {geoData.features.map((feature) => {
            const sigla = feature.properties.sigla
            const estadoData = dataMap[sigla]
            const count = estadoData?.total_proponentes || 0
            const intensity = count / maxVal
            const isHovered = hovered === sigla
            const fill = count > 0
              ? `rgba(0, 212, 255, ${0.15 + intensity * 0.75})`
              : 'rgba(255,255,255,0.04)'

            return (
              <g
                key={sigla}
                onMouseEnter={() => setHovered(sigla)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              >
                <PathFromGeo
                  geometry={feature.geometry}
                  fill={isHovered ? 'rgba(0, 212, 255, 0.95)' : fill}
                  stroke={isHovered ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'}
                  strokeWidth={isHovered ? 0.15 : 0.08}
                />
              </g>
            )
          })}
        </svg>
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1 px-2">
        <span>0</span>
        <div className="flex-1 h-2 mx-2 rounded-full bg-gradient-to-r from-sigma-neon/10 via-sigma-neon/50 to-sigma-neon" />
        <span>{maxVal.toLocaleString('pt-BR')}</span>
      </div>
    </div>
  )
}

function PathFromGeo({
  geometry,
  fill,
  stroke,
  strokeWidth,
}: {
  geometry: unknown
  fill: string
  stroke: string
  strokeWidth: number
}) {
  const paths = geometryToPathStrings(geometry)
  return (
    <>
      {paths.map((d, i) => (
        <path key={i} d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      ))}
    </>
  )
}

function geometryToPathStrings(geometry: unknown): string[] {
  const geo = geometry as { type: string; coordinates: unknown }
  if (geo.type === 'Polygon') {
    return [(geo.coordinates as number[][][]).map(ringToPath).join(' ')]
  }
  if (geo.type === 'MultiPolygon') {
    return (geo.coordinates as number[][][][]).map((polygon) =>
      polygon.map(ringToPath).join(' ')
    )
  }
  return []
}

function ringToPath(ring: number[][]): string {
  return ring
    .map((coord, i) => `${i === 0 ? 'M' : 'L'}${coord[0]},${-coord[1]}`)
    .join('') + 'Z'
}
