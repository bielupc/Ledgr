import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApi } from './api.ts'
import { openDatabase, resolveDbPath } from './db.ts'
import { runJobs } from './jobs.ts'

const PORT = Number(process.env.API_PORT ?? 5174)
const IS_PROD = process.env.NODE_ENV === 'production'
const JOB_INTERVAL_MS = 30 * 60 * 1000

const db = openDatabase()
const app = new Hono()

app.route('/api', createApi(db))

if (IS_PROD) {
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), 'dist') || './dist' }))
  app.get('/*', serveStatic({ path: './dist/index.html' }))
}

/*
 * A local app cannot rely on cron — the machine is often asleep at the moment
 * something falls due. Running on boot and on an interval, with idempotent
 * jobs, means whatever was missed is simply caught up at next launch.
 */
function tick() {
  try {
    const report = runJobs(db)
    if (report.postedTransactions > 0) {
      console.log(`[jobs] posted ${report.postedTransactions} recurring transaction(s)`)
    }
  } catch (error) {
    console.error('[jobs] run failed', error)
  }
}

tick()
setInterval(tick, JOB_INTERVAL_MS).unref()

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[ledgr] api on http://localhost:${info.port}  ·  db ${resolveDbPath()}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    db.close()
    process.exit(0)
  })
}
