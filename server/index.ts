import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createApi } from './api.ts'
import { runJobs } from './jobs.ts'

const app = new Hono<{ Bindings: Env }>()

/*
 * The frontend lives on Pages, a different origin from this Worker, so
 * cross-origin calls need CORS rather than the same-origin relative fetch a
 * single Node process used to get for free. `_redirects`-based proxying
 * (rewriting /api/* to an external origin) turned out not to be something
 * Cloudflare Pages actually supports — see public/_redirects — so this is
 * the real mechanism, not a fallback.
 *
 * Matches the Pages domain configured as PAGES_ORIGIN (wrangler.toml) plus
 * its per-deploy preview subdomains (<hash>.<project>.pages.dev), and
 * localhost for anyone hitting the deployed API directly from a local build.
 * Reading it from an env var rather than a hardcoded domain is what lets
 * this same code work for anyone deploying their own copy — see the
 * "Deploy to your own Cloudflare account" section in the README.
 */
const LOCALHOST_ORIGIN = /^http:\/\/localhost:\d+$/

function isAllowedOrigin(origin: string, pagesOrigin: string): boolean {
  if (LOCALHOST_ORIGIN.test(origin)) return true
  try {
    const requested = new URL(origin)
    const configuredHost = new URL(pagesOrigin).host
    return (
      requested.protocol === 'https:' &&
      (requested.host === configuredHost || requested.host.endsWith(`.${configuredHost}`))
    )
  } catch {
    return false
  }
}

app.use(
  '/api/*',
  cors({
    origin: (origin, c) => (origin && isAllowedOrigin(origin, c.env.PAGES_ORIGIN) ? origin : null),
  }),
)

app.route('/api', createApi())
app.get('/', (c) => c.text('Ledgr API — the frontend is served from Pages, not here.'))

export default {
  fetch: app.fetch,

  /*
   * The Node process used to catch up recurring postings on boot and every
   * 30 minutes via setInterval, because a laptop is often asleep at the
   * moment something falls due. A Worker has no persistent process to run
   * that on — the Cron Trigger in wrangler.toml calls this on the same
   * schedule instead, and runJobs stays just as idempotent either way.
   */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runJobs(env.DB).then((report) => {
        if (report.postedTransactions > 0) {
          console.log(`[jobs] posted ${report.postedTransactions} recurring transaction(s)`)
        }
      }),
    )
  },
} satisfies ExportedHandler<Env>
