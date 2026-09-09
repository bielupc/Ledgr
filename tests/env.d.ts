declare namespace Cloudflare {
  interface Env {
    // Set in vitest.config.ts, consumed by tests/apply-migrations.ts.
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
  }
}
