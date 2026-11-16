-- CreateTable
CREATE TABLE `Printer` (
    `code` VARCHAR(4) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed reference printers (#168 — seed-only management, like ProdGoal). Matches
-- prisma/seed.ts's PRINTERS list so a migrated-but-not-reseeded DB still has them.
INSERT INTO `Printer` (`code`, `name`, `active`) VALUES
    ('OCL0', 'Label Hut 0', true),
    ('OCL1', 'Label Hut 1', true),
    ('OCL2', 'Label Hut 2', true),
    ('OBP1', 'Backpack Label Hut 1', true),
    ('IM01', 'Inventory Manager Cage 1', true),
    ('IM02', 'Inventory Manager Cage 2', true),
    ('QA01', 'ICQA 1', true),
    ('RC01', 'Mobile Printer 1', true),
    ('RC02', 'Mobile Printer 2', false),
    ('A303', 'Aisle 303', true),
    ('A304', 'Aisle 304', true),
    ('R101', 'Door 101', true),
    ('ART1', 'ART Line 1', true),
    ('PS01', 'Inbound Problem Solver 1', true),
    ('DP01', 'Depal / Mezzanine 1', true),
    ('MBP1', 'Breakpack 1', true);
