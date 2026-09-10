import { useMemo } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
// The lib/ build is CJS and its default interops to a module object under
// Vite, not a component. esm/ is real ESM with a proper default export.
import ReactEChartsCore from 'echarts-for-react/esm/core'
import type { EChartsOption } from 'echarts'
import { CHART_TOKENS, baseOption, type Tokens } from '@/lib/charts'
import { useResolvedTokens } from '@/hooks/useCssVariable'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { useTheme } from '@/lib/theme'

// Registering only what the dashboard draws keeps the bundle far below the
// full ECharts build.
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  VisualMapComponent,
  SVGRenderer,
])

interface ChartProps {
  build: (tokens: Tokens, reducedMotion: boolean) => EChartsOption
  height?: number | string
  className?: string
  onEvents?: Record<string, (params: never) => void>
}

export function Chart({ build, height = 240, className, onEvents }: ChartProps) {
  const tokens = useResolvedTokens(CHART_TOKENS)
  const reducedMotion = usePrefersReducedMotion()
  const { theme } = useTheme()
  const ready = Boolean(tokens['--foreground'])

  const option = useMemo(() => {
    if (!ready) return {}
    const base = baseOption(tokens, reducedMotion)
    const custom = build(tokens, reducedMotion)
    // `tooltip` is merged rather than replaced: every chart defines its own
    // trigger and formatter, and a shallow spread would drop the shared
    // colours, appendTo and styling along with them.
    return {
      ...base,
      ...custom,
      tooltip: { ...base.tooltip, ...custom.tooltip },
    }
  }, [tokens, reducedMotion, build, ready])

  if (!ready) return <div style={{ height }} className={className} />

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      // Re-keying on theme forces a clean rebuild with the new palette rather
      // than merging colours into the old instance.
      key={theme}
      notMerge
      lazyUpdate
      style={{ height, width: '100%' }}
      className={className}
      onEvents={onEvents}
      // SVG rather than canvas: resolution-independent, so the marks stay
      // crisp on any display instead of softening at fractional DPI.
      opts={{ renderer: 'svg' }}
    />
  )
}
