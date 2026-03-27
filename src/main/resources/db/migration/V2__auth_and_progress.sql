-- Add auth + progress fields to player table.
-- Assumption: fresh DB or no existing players. If you already have data, adjust accordingly.

ALTER TABLE player
    ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN max_unlocked_level INT NOT NULL DEFAULT 1,
    ADD COLUMN volume INT NOT NULL DEFAULT 70;

