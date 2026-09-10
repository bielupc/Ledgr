import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { openLocalD1 } from './local-d1.ts'
import { seed, seedInvestments } from './seed-data.ts'

const empty = process.argv.includes('--empty')

// Wipe local D1 state, same as the old script's fs.rmSync on the sqlite
// file — then let `wrangler d1 migrations apply` recreate the schema fresh.
fs.rmSync('.wrangler/state/v3/d1', { recursive: true, force: true })
execSync('wrangler d1 migrations apply ledgr --local --persist-to=.wrangler/state', {
  stdio: 'inherit',
})

const { db, close } = await openLocalD1()
if (!empty) {
  await seed(db)
  await seedInvestments(db)
}

const counts = await db
  .prepare(
    `SELECT (SELECT count(*) FROM accounts) AS accounts,
            (SELECT count(*) FROM transactions) AS transactions,
            (SELECT count(*) FROM transfers) AS transfers,
            (SELECT count(*) FROM netWorthSnapshots) AS snapshots,
            (SELECT count(*) FROM funds) AS funds,
            (SELECT count(*) FROM investmentOrders) AS investmentOrders,
            (SELECT count(*) FROM fundPrices) AS fundPrices`,
  )
  .first()

console.log(`[db:reset] ${empty ? 'empty' : 'seeded'} local D1 database`, counts)
await close()
