import { TIER_COLORS, TIER_LABELS, type Tier } from '@/lib/tiers'

export default function TierBadge({ tier }: { tier: Tier }) {
  const color = TIER_COLORS[tier]
  const label = TIER_LABELS[tier]

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border"
      style={{
        color,
        borderColor: color,
        backgroundColor: `${color}15`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}
