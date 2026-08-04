/*
  Warnings:

  - You are about to drop the column `holdTypeCode` on the `Location` table. All the data in the column will be lost.
  - You are about to drop the `HoldType` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `Location` DROP FOREIGN KEY `Location_holdTypeCode_fkey`;

-- DropIndex
DROP INDEX `Location_holdTypeCode_fkey` ON `Location`;

-- AlterTable
ALTER TABLE `ActivityLog` ADD COLUMN `reasonNumber` VARCHAR(2) NULL,
    ADD COLUMN `reasonPrefix` VARCHAR(1) NULL;

-- AlterTable
ALTER TABLE `Location` DROP COLUMN `holdTypeCode`;

-- DropTable
DROP TABLE `HoldType`;

-- CreateTable
CREATE TABLE `ReasonCodePrefix` (
    `letter` VARCHAR(1) NOT NULL,
    `desc` VARCHAR(30) NOT NULL,
    `departmentId` VARCHAR(3) NULL,
    `minRole` VARCHAR(10) NULL,

    PRIMARY KEY (`letter`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReasonCode` (
    `number` VARCHAR(2) NOT NULL,
    `desc` VARCHAR(60) NOT NULL,

    PRIMARY KEY (`number`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReasonCodePrefixAllowance` (
    `reasonCodeNumber` VARCHAR(2) NOT NULL,
    `prefixLetter` VARCHAR(1) NOT NULL,

    PRIMARY KEY (`reasonCodeNumber`, `prefixLetter`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReasonCodeDomain` (
    `reasonCodeNumber` VARCHAR(2) NOT NULL,
    `domain` VARCHAR(20) NOT NULL,

    PRIMARY KEY (`reasonCodeNumber`, `domain`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserDepartment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userZ` VARCHAR(7) NOT NULL,
    `departmentId` VARCHAR(3) NOT NULL,

    INDEX `UserDepartment_userZ_idx`(`userZ`),
    UNIQUE INDEX `UserDepartment_userZ_departmentId_key`(`userZ`, `departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ActivityLog_reasonPrefix_idx` ON `ActivityLog`(`reasonPrefix`);

-- CreateIndex
CREATE INDEX `ActivityLog_reasonNumber_idx` ON `ActivityLog`(`reasonNumber`);

-- AddForeignKey
ALTER TABLE `ReasonCodePrefix` ADD CONSTRAINT `ReasonCodePrefix_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReasonCodePrefixAllowance` ADD CONSTRAINT `ReasonCodePrefixAllowance_reasonCodeNumber_fkey` FOREIGN KEY (`reasonCodeNumber`) REFERENCES `ReasonCode`(`number`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReasonCodePrefixAllowance` ADD CONSTRAINT `ReasonCodePrefixAllowance_prefixLetter_fkey` FOREIGN KEY (`prefixLetter`) REFERENCES `ReasonCodePrefix`(`letter`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReasonCodeDomain` ADD CONSTRAINT `ReasonCodeDomain_reasonCodeNumber_fkey` FOREIGN KEY (`reasonCodeNumber`) REFERENCES `ReasonCode`(`number`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDepartment` ADD CONSTRAINT `UserDepartment_userZ_fkey` FOREIGN KEY (`userZ`) REFERENCES `User`(`zNumber`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDepartment` ADD CONSTRAINT `UserDepartment_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_reasonPrefix_fkey` FOREIGN KEY (`reasonPrefix`) REFERENCES `ReasonCodePrefix`(`letter`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_reasonNumber_fkey` FOREIGN KEY (`reasonNumber`) REFERENCES `ReasonCode`(`number`) ON DELETE NO ACTION ON UPDATE NO ACTION;
