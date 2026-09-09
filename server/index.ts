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
 * Matches the stable Pages domain plus its per-deploy preview subdomains
 * (<hash>.<project>.pages.dev) and localhost for anyone hitting the deployed
 * API directly from a local build.
 */
const ALLOWED_ORIGINS = [/^https:\/\/([a-z0-9-]+\.)?ledgr-4g0\.pages\.dev$/, /^http:\/\/localhost:\d+$/]

app.use(
  '/api/*',
  cors({
    origin: (origin) => (origin && ALLOWED_ORIGINS.some((re) => re.test(origin)) ? origin : null),
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
