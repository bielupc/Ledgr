-- A transaction may override the icon it inherits from its category, so a named
-- row can carry its own mark ("Netflix" as a clapperboard while its category is
-- Subscriptions). Null means: use the category's icon.
ALTER TABLE transactions ADD COLUMN icon TEXT;
