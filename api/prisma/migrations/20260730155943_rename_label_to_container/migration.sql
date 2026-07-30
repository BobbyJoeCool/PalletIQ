/*
  Hand-edited (not Prisma-generated as-is) — Prisma's own diff can't detect a
  model/column rename, so its default output was a destructive DROP TABLE `Label` +
  CREATE TABLE `Container`, which would have discarded the table's 1251 existing rows.
  Rewritten as an actual rename: drop the old-named FKs, RENAME TABLE, CHANGE COLUMN
  for the PK, then re-add the FKs under their new, matching-convention names. Data-
  preserving; no rows are dropped or recreated.
*/
-- DropForeignKey
ALTER TABLE `Label` DROP FOREIGN KEY `Label_dept_class_item_fkey`;

-- DropForeignKey
ALTER TABLE `Label` DROP FOREIGN KEY `Label_destinationStore_fkey`;

-- DropForeignKey
ALTER TABLE `Label` DROP FOREIGN KEY `Label_pid_fkey`;

-- RenameTable
RENAME TABLE `Label` TO `Container`;

-- RenameColumn (lid -> cid, same position/type/constraints)
ALTER TABLE `Container` CHANGE COLUMN `lid` `cid` VARCHAR(36) NOT NULL;

-- AddForeignKey
ALTER TABLE `Container` ADD CONSTRAINT `Container_pid_fkey` FOREIGN KEY (`pid`) REFERENCES `Pallet`(`pid`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Container` ADD CONSTRAINT `Container_dept_class_item_fkey` FOREIGN KEY (`dept`, `class`, `item`) REFERENCES `Item`(`dept`, `class`, `item`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Container` ADD CONSTRAINT `Container_destinationStore_fkey` FOREIGN KEY (`destinationStore`) REFERENCES `Store`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
