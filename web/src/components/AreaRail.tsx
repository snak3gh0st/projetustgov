'use client'

import { useRouter } from 'next/navigation'
import { m } from 'motion/react'
import { AREAS, AREA_COOKIE, areaHome, getAreasForRole, type AreaId } from '@/lib/areas'
import type { Role } from '@/lib/roles'
import BrandLockup from '@/components/BrandLockup'
import { NavIcon } from '@/components/NavIcon'

export function rememberArea(id: AreaId) {
  document.cookie = `${AREA_COOKIE}=${id}; path=/; max-age=31536000; SameSite=Lax`
}

export function readRememberedArea(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${AREA_COOKIE}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

interface AreaRailProps {
  role: Role
  current: AreaId
  onChange: (id: AreaId) => void
}

// Barra fina das áreas (só para quem trabalha em mais de uma). Clicar leva à primeira tela da área.
export default function AreaRail({ role, current, onChange }: AreaRailProps) {
  const router = useRouter()
  const areas = getAreasForRole(role)

  function select(id: AreaId) {
    rememberArea(id)
    onChange(id)
    if (id !== current) router.push(areaHome(role, id))
  }

  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1.5 bg-sigma-navy py-3">
      <div className="mb-3 rounded-lg bg-white/95 p-1">
        <BrandLockup compact />
      </div>
      <nav aria-label="Áreas" className="flex flex-col items-center gap-1.5">
        {areas.map((id) => {
          const active = id === current
          return (
            <button
              key={id}
              type="button"
              onClick={() => select(id)}
              aria-label={AREAS[id].label}
              aria-current={active ? 'true' : undefined}
              className={`group relative inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                active ? 'text-white' : 'text-white/55 hover:bg-white/10 hover:text-white'
              }`}
            >
              {active && (
                <m.span
                  layoutId="area-active"
                  aria-hidden
                  className="absolute inset-0 rounded-lg bg-accent"
                  transition={{ type: 'tween', duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <NavIcon name={AREAS[id].icon} className="relative h-[18px] w-[18px]" />
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full z-tooltip ml-3 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {AREAS[id].label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
