export type DB = D1Database

export function newId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

/*
 * A Worker has no machine timezone to read `today()` from the way the old
 * Node process did — it can run in any Cloudflare PoP and always reports UTC.
 * The app reasons in the user's own days, so this is pinned to a fixed IANA
 * zone rather than silently becoming "today in UTC," which would post
 * recurring transactions up to two hours into the wrong local day near
 * midnight. Single-user app, no timezone setting in the UI: change this if
 * you're not in Europe/Madrid.
 */
const USER_TIME_ZONE = 'Europe/Madrid'

export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: USER_TIME_ZONE }).format(new Date())
}
