-- AlterTable
ALTER TABLE `Location` ADD COLUMN `revertStatus` VARCHAR(15) NULL,
    ADD COLUMN `statusExpiry` DATETIME(3) NULL;
