-- Rename quantity → cartonQuantity and add palletQuantity (default 0)
ALTER TABLE `Container` RENAME COLUMN `quantity` TO `cartonQuantity`;
ALTER TABLE `Container` ADD COLUMN `palletQuantity` INTEGER NOT NULL DEFAULT 0;
