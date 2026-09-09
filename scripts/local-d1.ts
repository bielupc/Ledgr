import { getPlatformProxy } from 'wrangler'
import type { DB } from '../server/db.ts'

/*
 * Shared by db-reset.ts and db-seed.ts: a real D1Database binding for local
 * scripting, without spinning up a dev server. `getPlatformProxy` is
 * Wrangler's own stable API for this — unlike Miniflare's lower-level
 * constructor (whose config shape is still moving under it), this reads
 * wrangler.toml directly and persists to `.wrangler/state/v3` by default,
 * the same place `wrangler dev` does, so the two always see the same data.
 */
export async function openLocalD1(): Promise<{ db: DB; close: () => Promise<void> }> {
  const proxy = await getPlatformProxy<{ DB: DB }>()
  return { db: proxy.env.DB, close: proxy.dispose }
}
