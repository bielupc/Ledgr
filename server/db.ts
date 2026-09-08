import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { runMigrations } from './migrate.ts'

export type DB = Database.Database

export const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data/ledgr.db')

export function resolveDbPath(): string {
  return process.env.LEDGR_DB ?? DEFAULT_DB_PATH
}

export function openDatabase(file: string = resolveDbPath()): DB {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  }

  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  runMigrations(db)
  return db
}

export function newId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

/** Local-clock today as YYYY-MM-DD; the app reasons in the user's own days. */
export function today(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}
