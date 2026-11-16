-- Prod Goal / Ramping / Daily Plan (Desktop, #146): prod goals keep dated history. The
-- one-row-per-function primary key becomes an id, with one row per function per
-- effective date. Existing rows keep their effectiveDate and become the first entry of
-- each function's history.

-- AlterTable
ALTER TABLE `ProdGoal`
    DROP PRIMARY KEY,
    ADD COLUMN `id` INTEGER NOT NULL AUTO_INCREMENT FIRST,
    ADD COLUMN `setByZ` VARCHAR(7) NULL,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD PRIMARY KEY (`id`);

-- CreateIndex
CREATE UNIQUE INDEX `ProdGoal_functionCode_effectiveDate_key` ON `ProdGoal`(`functionCode`, `effectiveDate`);

-- AddForeignKey
ALTER TABLE `ProdGoal` ADD CONSTRAINT `ProdGoal_setByZ_fkey` FOREIGN KEY (`setByZ`) REFERENCES `User`(`zNumber`) ON DELETE NO ACTION ON UPDATE NO ACTION;
