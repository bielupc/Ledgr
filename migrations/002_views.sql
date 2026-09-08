-- Balance arithmetic lives here so no caller can assemble it differently.
-- Transfers move money between accounts, so they count on both sides.
CREATE VIEW accountBalances AS
SELECT
  a.id,
  a.name,
  a.icon,
  a.sortOrder,
  a.deletedAt,
  a.initialBalanceCents,
  a.initialBalanceCents
    + coalesce((SELECT sum(t.amountCents) FROM transactions t
                WHERE t.accountId = a.id AND t.kind = 'income'), 0)
    - coalesce((SELECT sum(t.amountCents) FROM transactions t
                WHERE t.accountId = a.id AND t.kind = 'expense'), 0)
    + coalesce((SELECT sum(r.amountCents) FROM transfers r
                WHERE r.toAccountId = a.id), 0)
    - coalesce((SELECT sum(r.amountCents) FROM transfers r
                WHERE r.fromAccountId = a.id), 0)
    AS balanceCents
FROM accounts a;
