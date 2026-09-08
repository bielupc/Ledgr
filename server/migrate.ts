import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Database } from 'better-sqlite3'

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url))

export function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/**
 * Applies pending migrations in filename order, tracking progress in
 * `PRAGMA user_version`. Each file runs in its own transaction, so a failure
 * leaves the database on the last version that fully applied.
 */
export function runMigrations(db: Database): number {
  const files = migrationFiles()
  const current = db.pragma('user_version', { simple: true }) as number
  let applied = 0

  files.forEach((file, index) => {
    const version = index + 1
    if (version <= current) return

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    db.exec('BEGIN')
    try {
      db.exec(sql)
      db.pragma(`user_version = ${version}`)
      db.exec('COMMIT')
      applied += 1
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, {
        cause: error,
      })
    }
  })

  return applied
}
