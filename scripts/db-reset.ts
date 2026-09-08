import fs from 'node:fs'
import { openDatabase, resolveDbPath } from '../server/db.ts'
import { seed } from '../server/seed.ts'

const empty = process.argv.includes('--empty')
const file = resolveDbPath()

for (const suffix of ['', '-shm', '-wal']) {
  fs.rmSync(`${file}${suffix}`, { force: true })
}

const db = openDatabase(file)
if (!empty) seed(db)

const counts = db
  .prepare(
    `SELECT (SELECT count(*) FROM accounts) AS accounts,
            (SELECT count(*) FROM transactions) AS transactions,
            (SELECT count(*) FROM transfers) AS transfers,
            (SELECT count(*) FROM netWorthSnapshots) AS snapshots`,
  )
  .get()

console.log(`[db:reset] ${empty ? 'empty' : 'seeded'} database at ${file}`, counts)
db.close()
