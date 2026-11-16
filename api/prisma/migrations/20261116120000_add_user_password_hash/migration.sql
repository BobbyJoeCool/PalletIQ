-- AlterTable
-- Desktop-app password credential (apps/desktop-app bootstrap, #140). Nullable: only
-- desktop-eligible users (LEAD/MANAGER/ADMIN, or home department IQA) ever get one.
ALTER TABLE `User` ADD COLUMN `passwordHash` VARCHAR(255) NULL;

-- Backfill the demo desktop password ("Desktop1234", bcrypt cost 10) onto the three
-- desktop-eligible core demo users, matching prisma/seed.ts, so a migrated-but-not-
-- reseeded DB can log into the desktop app (same approach as 20261115120000_add_printer).
UPDATE `User`
SET `passwordHash` = '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG'
WHERE `zNumber` IN ('z002p23', 'z002p24', 'z002p25');
