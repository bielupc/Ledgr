import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/theme'

/** Ordered 4×4 Bayer matrix, as used in the brand guidelines. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

export type DitherVariant = 'paper' | 'emerald'

interface DitherFieldProps {
  variant?: DitherVariant
  /** Light source in normalised coordinates; 0,0 is top-left. */
  origin?: [number, number]
  radius?: number
  intensity?: number
  /** Larger values give chunkier pixels. */
  scale?: number
  className?: string
}

/*
 * Backgrounds are ordered-dither fields that resolve into the grid. Rendered on
 * a canvas at one pixel per cell and upscaled with image-rendering: pixelated,
 * so the texture stays crisp instead of being smoothed by the browser.
 */
export function DitherField({
  variant = 'paper',
  origin = [1.05, -0.1],
  radius = 0.95,
  intensity = 0.8,
  scale = 1,
  className,
}: DitherFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()
  const [originX, originY] = origin

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return

      const px = Math.max(2, Math.round((Math.min(rect.width, rect.height) / 90) * scale))
      const width = (canvas.width = Math.max(1, Math.round(rect.width / px)))
      const height = (canvas.height = Math.max(1, Math.round(rect.height / px)))

      const context = canvas.getContext('2d')
      if (!context) return
      context.clearRect(0, 0, width, height)

      const aspect = rect.width / rect.height

      // In light mode the ink inverts to Carbon so the texture reads as a
      // shadow on Paper rather than a glow on Carbon.
      const colors =
        variant === 'emerald'
          ? (['#0a5c3a', '#00b36b'] as const)
          : theme === 'dark'
            ? (['rgba(238,241,238,0.5)', 'rgba(238,241,238,0.8)'] as const)
            : (['rgba(8,10,9,0.14)', 'rgba(8,10,9,0.22)'] as const)

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const u = x / width
          const v = y / height
          const distance = Math.hypot((u - originX) * aspect, v - originY)
          const value = Math.min(1, Math.max(0, (1 - distance / radius) * intensity))
          const threshold = (BAYER[y % 4]![x % 4]! + 0.5) / 16

          if (value > threshold) {
            context.fillStyle = value > 0.9 ? colors[1] : colors[0]
            context.fillRect(x, y, 1, 1)
          }
        }
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
    // Depends on the coordinates, not the array, so a literal prop does not
    // force a redraw on every render.
  }, [variant, originX, originY, radius, intensity, scale, theme])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
