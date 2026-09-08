-- A transaction's free-text field was always used as its identity, not as a
-- remark: the label a row is recognised by ("Mercadona", "Rent"). Renaming it
-- makes that explicit and lets tables lead with it.
--
-- Recurring rules carry the same field because they stamp it onto every
-- occurrence they post, so it is renamed in step.
--
-- Transfers keep `note`. A transfer has no identity to name; it is two accounts
-- and an amount, and the free text there really is a remark.
ALTER TABLE transactions RENAME COLUMN note TO name;
ALTER TABLE recurringRules RENAME COLUMN note TO name;
