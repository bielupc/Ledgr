import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const CARBON = '#080a09'
const PAPER = '#eef1ee'
const EMERALD = '#00b36b'

/** The Grid at its exact ratios: cell 5, gap 1, radius 1 — 17 units square. */
function markSvg({
  size,
  background,
  cell = PAPER,
  padding = 0,
}: {
  size: number
  background: string | null
  cell?: string
  padding?: number
}) {
  const span = 17
  const inner = size - padding * 2
  const unit = inner / span
  const rects: string[] = []

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const x = padding + col * unit * 6
      const y = padding + row * unit * 6
      const isLast = row === 2 && col === 2
      rects.push(
        `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(unit * 5).toFixed(2)}" height="${(unit * 5).toFixed(2)}" rx="${unit.toFixed(2)}" fill="${isLast ? EMERALD : cell}"/>`,
      )
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${background ? `<rect width="${size}" height="${size}" rx="${(size * 0.22).toFixed(2)}" fill="${background}"/>` : ''}
${rects.join('\n')}
</svg>`
}

const publicDir = path.resolve(process.cwd(), 'public')
fs.mkdirSync(publicDir, { recursive: true })

fs.writeFileSync(
  path.join(publicDir, 'favicon.svg'),
  markSvg({ size: 64, background: null, padding: 4 }),
)

const targets = [
  { file: 'pwa-192.png', size: 192, padding: 34 },
  { file: 'pwa-512.png', size: 512, padding: 90 },
  // Maskable art must survive a circular crop, so it carries more padding.
  { file: 'pwa-maskable-512.png', size: 512, padding: 128 },
  { file: 'apple-touch-icon.png', size: 180, padding: 30 },
]

await Promise.all(
  targets.map(async ({ file, size, padding }) => {
    const svg = markSvg({ size, background: CARBON, padding })
    await sharp(Buffer.from(svg)).png().toFile(path.join(publicDir, file))
    console.log(`[icons] ${file}`)
  }),
)
