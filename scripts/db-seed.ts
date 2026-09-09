import { openLocalD1 } from './local-d1.ts'
import { seed } from './seed-data.ts'

const { db, close } = await openLocalD1()

const existing = await db.prepare('SELECT count(*) AS n FROM accounts').first<{ n: number }>()
if (existing && existing.n > 0) {
  console.error('Database already has accounts. Run `npm run db:reset` to start over.')
  process.exit(1)
}

await seed(db)

const counts = await db
  .prepare(
    `SELECT (SELECT count(*) FROM accounts) AS accounts,
            (SELECT count(*) FROM categories) AS categories,
            (SELECT count(*) FROM transactions) AS transactions,
            (SELECT count(*) FROM transfers) AS transfers,
            (SELECT count(*) FROM netWorthSnapshots) AS snapshots`,
  )
  .first()

console.log('[seed] done', counts)
await close()
