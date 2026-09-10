-- Investment portfolio: funds, broker orders and their daily NAVs.
--
-- Deliberately unconnected to the ledger's accounts: the portfolio is its own
-- surface with its own value and performance, not a balance folded into net
-- worth. No RLS, same single-user assumption as 0001: this is a personal
-- dashboard, not a per-row-owned multi-tenant table.

CREATE TABLE funds (
  isin        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  shortName   TEXT,
  ftXid       TEXT,
  resolvedAt  TEXT,
  targetBps   INTEGER NOT NULL DEFAULT 0 CHECK (targetBps BETWEEN 0 AND 10000),
  sortOrder   INTEGER NOT NULL DEFAULT 0,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Operation kinds: buy/sell are external cash in and out. transferIn/Out are
-- MyInvestor "traspasos" and fund switches — money moving between funds
-- inside the same portfolio, never a contribution. Kept as a kind on this one
-- table (rather than a separate table, the way transfers split from
-- transactions in the main ledger) because a traspaso still moves a single
-- fund's own share count and cost basis — every downstream calculation reads
-- one table and switches on `kind`, the same way analytics reads recurrence
-- off one column rather than a parallel schedule.
CREATE TABLE investmentOrders (
  id                TEXT PRIMARY KEY,
  brokerOperationId TEXT NOT NULL UNIQUE,
  isin              TEXT NOT NULL REFERENCES funds(isin),
  kind              TEXT NOT NULL CHECK (kind IN ('buy', 'sell', 'transferIn', 'transferOut')),
  tradedOn          TEXT NOT NULL,
  settledOn         TEXT NOT NULL,
  -- Shares scaled by 1e8 and NAV by 1e6, stored as exact integers rather than
  -- REAL: a position fully sold must close to exactly zero shares, not to a
  -- float residue a few units off that keeps the fund showing as held.
  shareUnits        INTEGER NOT NULL CHECK (shareUnits > 0),
  navMicros         INTEGER NOT NULL CHECK (navMicros > 0),
  amountCents       INTEGER NOT NULL CHECK (amountCents > 0),
  createdAt         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX ix_investmentOrders_isin_tradedOn ON investmentOrders (isin, tradedOn);

CREATE TABLE fundPrices (
  isin      TEXT NOT NULL REFERENCES funds(isin),
  pricedOn  TEXT NOT NULL,
  navMicros INTEGER NOT NULL CHECK (navMicros > 0),
  -- 'ft' always wins over 'order': an order's own NAV is only ever a
  -- fallback for a date the Financial Times hasn't (or can't) supply.
  source    TEXT NOT NULL CHECK (source IN ('ft', 'order')),
  PRIMARY KEY (isin, pricedOn)
);
