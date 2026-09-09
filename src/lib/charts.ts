import type { EChartsOption } from 'echarts'
import { formatEuro, formatEuroCompact } from '@/lib/format'

export const CHART_TOKENS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
  '--chart-7',
  '--chart-other',
  '--chart-cat-1',
  '--chart-cat-2',
  '--chart-cat-3',
  '--chart-cat-4',
  '--chart-cat-5',
  '--chart-grid',
  '--chart-axis',
  '--foreground',
  '--muted-foreground',
  '--popover',
  '--border',
  '--emerald',
  '--positive',
  '--negative',
  '--surface',
]

export type Tokens = Record<string, string>

/**
 * Assigned in fixed order and never cycled: a category keeps its hue when the
 * set is filtered, and the tail folds into "Other". Red, blue and green are
 * excluded from this arbitrary-category palette — those hues are reserved for
 * expense, net worth and income respectively.
 *
 * Five, and callers must fold at `length` rather than assume seven: five is
 * the largest set that can be told apart pairwise once those three hues are
 * gone. See the token block in `globals.css` for the measurements.
 */
export function categoricalPalette(tokens: Tokens): string[] {
  return [
    tokens['--chart-cat-1'],
    tokens['--chart-cat-2'],
    tokens['--chart-cat-3'],
    tokens['--chart-cat-4'],
    tokens['--chart-cat-5'],
  ].filter(Boolean) as string[]
}

/** How many slots the categorical palette actually has, so the fold-into-Other
 *  point is derived rather than repeated as a literal on every surface. */
export const CATEGORICAL_SLOTS = 5

/**
 * Tokens arrive already resolved to `rgb()` (see `useResolvedTokens`), but the
 * brand hexes are used directly in places too, so both forms are accepted.
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim())
  if (rgb) {
    const [r, g, b] = rgb[1]!.split(/[\s,/]+/).filter(Boolean)
    return `rgba(${r},${g},${b},${alpha})`
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!hex) return color
  const value = Number.parseInt(hex[1]!, 16)
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`
}

export const ANIMATION = {
  duration: 520,
  easing: 'cubicOut',
  delay: (index: number) => index * 24,
} as const

export function baseOption(tokens: Tokens, reducedMotion: boolean): EChartsOption {
  return {
    animation: !reducedMotion,
    animationDuration: ANIMATION.duration,
    animationEasing: ANIMATION.easing,
    textStyle: {
      fontFamily: "'Instrument Sans Variable', system-ui, sans-serif",
      color: tokens['--muted-foreground'],
    },
    tooltip: {
      // Rendered into <body>, not the chart container: the card clips
      // overflow, so an in-container tooltip is cut off near the edges.
      appendTo: 'body',
      confine: false,
      backgroundColor: tokens['--popover'],
      borderColor: tokens['--border'],
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: tokens['--foreground'], fontSize: 12 },
      extraCssText:
        'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.28);z-index:60;pointer-events:none;',
    },
  }
}

export function axisLabelStyle(tokens: Tokens) {
  return {
    color: tokens['--muted-foreground'],
    fontSize: 10,
    fontFamily: "'DM Mono', ui-monospace, monospace",
  }
}

export function moneyAxis(tokens: Tokens) {
  return {
    type: 'value' as const,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: tokens['--chart-grid'], width: 1 } },
    axisLabel: {
      ...axisLabelStyle(tokens),
      formatter: (value: number) => formatEuroCompact(value),
    },
  }
}

export function categoryAxis(tokens: Tokens, data: string[]) {
  return {
    type: 'category' as const,
    data,
    axisLine: { lineStyle: { color: tokens['--chart-grid'] } },
    axisTick: { show: false },
    axisLabel: axisLabelStyle(tokens),
  }
}

export function tooltipRow(marker: string, label: string, cents: number): string {
  return `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;margin-top:4px">
    <span style="display:flex;align-items:center;gap:6px">${marker}${label}</span>
    <span style="font-family:'DM Mono',monospace;font-variant-numeric:tabular-nums">${formatEuro(cents)}</span>
  </div>`
}
