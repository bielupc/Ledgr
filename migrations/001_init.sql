-- Ledgr initial schema.
--
-- Money is INTEGER cents throughout: SQLite has no exact decimal type, and
-- storing euros as REAL would drift under aggregation.
-- Dates are TEXT 'YYYY-MM-DD'; timestamps TEXT from datetime('now') (UTC).
-- Columns are camelCase so rows deserialise straight into the API shape.

CREATE TABLE accounts (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  icon                TEXT NOT NULL DEFAULT 'wallet',
  initialBalanceCents INTEGER NOT NULL DEFAULT 0,
  sortOrder           INTEGER NOT NULL DEFAULT 0,
  createdAt           TEXT NOT NULL DEFAULT (datetime('now')),
  -- Soft delete: drops out of pickers, stays intact in history.
  deletedAt           TEXT
);

CREATE TABLE categories (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  icon      TEXT NOT NULL DEFAULT 'tag',
  kind      TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  color     TEXT,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT
);

CREATE TABLE recurringRules (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  amountCents     INTEGER NOT NULL CHECK (amountCents > 0),
  accountId       TEXT NOT NULL REFERENCES accounts(id),
  categoryId      TEXT REFERENCES categories(id),
  note            TEXT,
  frequency       TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  intervalCount   INTEGER NOT NULL DEFAULT 1 CHECK (intervalCount > 0),
  startDate       TEXT NOT NULL,
  endDate         TEXT,
  -- Index of the next occurrence, counted from startDate. Occurrence dates are
  -- always derived as startDate + n intervals, never by advancing a cursor:
  -- advancing clamps a 31st-of-month rule to the 28th and it never recovers.
  occurrenceIndex INTEGER NOT NULL DEFAULT 0,
  nextRunOn       TEXT NOT NULL,
  lastPostedOn    TEXT,
  isActive        INTEGER NOT NULL DEFAULT 1,
  createdAt       TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt       TEXT
);

CREATE TABLE transactions (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  occurredOn      TEXT NOT NULL,
  amountCents     INTEGER NOT NULL CHECK (amountCents > 0),
  accountId       TEXT NOT NULL REFERENCES accounts(id),
  categoryId      TEXT REFERENCES categories(id),
  note            TEXT,
  recurringRuleId TEXT REFERENCES recurringRules(id) ON DELETE SET NULL,
  createdAt       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Makes recurrence posting idempotent: catch-up after the app has been closed
-- for days can re-run freely without ever double-posting an occurrence.
CREATE UNIQUE INDEX ux_transactions_recurrence
  ON transactions (recurringRuleId, occurredOn)
  WHERE recurringRuleId IS NOT NULL;

CREATE INDEX ix_transactions_occurredOn ON transactions (occurredOn);
CREATE INDEX ix_transactions_accountId  ON transactions (accountId);
CREATE INDEX ix_transactions_categoryId ON transactions (categoryId);

-- Transfers are their own table rather than a transaction kind. That makes
-- "transfers never appear in income/expense analytics" structural: analytics
-- read `transactions` only, so the rule cannot be forgotten in one query.
CREATE TABLE transfers (
  id            TEXT PRIMARY KEY,
  occurredOn    TEXT NOT NULL,
  amountCents   INTEGER NOT NULL CHECK (amountCents > 0),
  fromAccountId TEXT NOT NULL REFERENCES accounts(id),
  toAccountId   TEXT NOT NULL REFERENCES accounts(id),
  note          TEXT,
  createdAt     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (fromAccountId <> toAccountId)
);

CREATE INDEX ix_transfers_occurredOn ON transfers (occurredOn);

-- One standing amount per expense category. Budgets reset monthly with no
-- rollover, so current-month status needs no per-month rows.
CREATE TABLE budgets (
  id          TEXT PRIMARY KEY,
  categoryId  TEXT NOT NULL UNIQUE REFERENCES categories(id),
  amountCents INTEGER NOT NULL CHECK (amountCents >= 0),
  createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE netWorthSnapshots (
  id          TEXT PRIMARY KEY,
  capturedOn  TEXT NOT NULL UNIQUE,
  amountCents INTEGER NOT NULL,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
