import puppeteer from 'puppeteer'

const OUT = '/tmp/claude-1000/-home-biel-Desktop-Ledgr/25d05c12-bceb-4b45-858a-ede435460aba/scratchpad'

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
page.on('pageerror', err => console.log('PAGEERROR:', err.message))
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 })
await page.goto('http://localhost:5173/investments', { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise(r => setTimeout(r, 1500))

const text = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('*')).filter(e => e.children.length === 0 && /TOTAL GAIN/i.test(e.parentElement?.parentElement?.textContent ?? ''))
  const gainBox = Array.from(document.querySelectorAll('div')).find(d => d.textContent.trim().startsWith('TOTAL GAIN'))
  return gainBox ? gainBox.innerHTML : 'not found'
})
console.log(text)

await page.screenshot({ path: `${OUT}/spaced_check.png`, clip: { x: 260, y: 90, width: 420, height: 400 } })
await browser.close()
