-- Location Setup (Desktop, #143): aisle structure tables, Not For Storage carve-outs,
-- and soft delete for locations.

-- AlterTable
ALTER TABLE `Location`
    ADD COLUMN `deleted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `notForStorageReason` VARCHAR(10) NULL,
    ADD COLUMN `notForStorageNote` VARCHAR(255) NULL;

-- CreateTable
CREATE TABLE `Aisle` (
    `aisle` INTEGER NOT NULL,
    `sides` VARCHAR(4) NOT NULL,
    `firstBin` INTEGER NOT NULL,
    `lastBin` INTEGER NOT NULL,
    `zoneDirection` VARCHAR(15) NOT NULL DEFAULT 'BACK_TO_FRONT',
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`aisle`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AisleZone` (
    `aisle` INTEGER NOT NULL,
    `zone` INTEGER NOT NULL,
    `startBin` INTEGER NOT NULL,
    `endBin` INTEGER NOT NULL,

    PRIMARY KEY (`aisle`, `zone`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AisleZoneSetting` (
    `aisle` INTEGER NOT NULL,
    `zone` INTEGER NOT NULL,
    `side` VARCHAR(4) NOT NULL,
    `level` INTEGER NOT NULL,
    `storageCode` VARCHAR(2) NOT NULL,
    `size` VARCHAR(2) NOT NULL,

    PRIMARY KEY (`aisle`, `zone`, `side`, `level`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AisleZone` ADD CONSTRAINT `AisleZone_aisle_fkey` FOREIGN KEY (`aisle`) REFERENCES `Aisle`(`aisle`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AisleZoneSetting` ADD CONSTRAINT `AisleZoneSetting_aisle_fkey` FOREIGN KEY (`aisle`) REFERENCES `Aisle`(`aisle`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AisleZoneSetting` ADD CONSTRAINT `AisleZoneSetting_storageCode_fkey` FOREIGN KEY (`storageCode`) REFERENCES `StorageCode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AisleZoneSetting` ADD CONSTRAINT `AisleZoneSetting_size_fkey` FOREIGN KEY (`size`) REFERENCES `Size`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- The Not For Storage storage code (decided 2026-11-16). Matches prisma/seed.ts.
INSERT INTO `StorageCode` (`id`, `desc`) VALUES ('XO', 'Not For Storage');

-- Backfill the structure of every existing aisle from its locations. Checked against the
-- local DB on 2026-11-16 before writing this: all 56 aisles have zones 1-4, and every
-- zone × side × level group has a single storage code and size, so MIN() just picks
-- that one value. Zone 1 holds each aisle's highest bins everywhere, so every existing
-- aisle is BACK_TO_FRONT (the column default).
INSERT INTO `Aisle` (`aisle`, `sides`, `firstBin`, `lastBin`)
SELECT `aisle`,
       CASE
           WHEN SUM(MOD(`bin`, 2) = 1) > 0 AND SUM(MOD(`bin`, 2) = 0) > 0 THEN 'BOTH'
           WHEN SUM(MOD(`bin`, 2) = 1) > 0 THEN 'ODD'
           ELSE 'EVEN'
       END,
       MIN(`bin`), MAX(`bin`)
FROM `Location`
GROUP BY `aisle`;

INSERT INTO `AisleZone` (`aisle`, `zone`, `startBin`, `endBin`)
SELECT `aisle`, `zone`, MIN(`bin`), MAX(`bin`)
FROM `Location`
GROUP BY `aisle`, `zone`;

INSERT INTO `AisleZoneSetting` (`aisle`, `zone`, `side`, `level`, `storageCode`, `size`)
SELECT `aisle`, `zone`,
       CASE WHEN MOD(`bin`, 2) = 1 THEN 'ODD' ELSE 'EVEN' END,
       `level`, MIN(`storageCode`), MIN(`size`)
FROM `Location`
GROUP BY `aisle`, `zone`, CASE WHEN MOD(`bin`, 2) = 1 THEN 'ODD' ELSE 'EVEN' END, `level`;
