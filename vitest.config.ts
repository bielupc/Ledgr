import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig, mergeConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'))

  return mergeConfig(
    {
      resolve: {
        alias: {
          '@': fileURLToPath(new URL('./src', import.meta.url)),
          '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
        },
      },
    },
    {
      plugins: [
        // Runs tests inside the Workers runtime with the same D1 binding
        // wrangler.toml declares, so tests exercise the exact driver
        // production does — no separate Node/better-sqlite3 stand-in to
        // drift from it.
        cloudflareTest({
          wrangler: { configPath: './wrangler.toml' },
          // Test-only binding: the schema exists nowhere until a setup file
          // applies these, since a fresh D1 instance per run starts empty.
          miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
        }),
      ],
      test: {
        include: ['tests/**/*.test.ts'],
        setupFiles: ['./tests/apply-migrations.ts'],
      },
    },
  )
})
