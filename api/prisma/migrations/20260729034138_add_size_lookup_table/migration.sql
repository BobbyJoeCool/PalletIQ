-- CreateTable
CREATE TABLE `Size` (
    `id` VARCHAR(2) NOT NULL,
    `desc` VARCHAR(60) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- SeedData: must land before the FK constraints below — Location/Pallet already have real
-- `size` values (S/M/L/HS/XS) at migration time, so the ALTER TABLE ADD CONSTRAINT
-- statements fail with a FK violation unless Size is populated first. Text matches
-- apps/floor-app/src/lib/sizes.ts's existing SIZE_NAMES exactly, not invented.
INSERT INTO `Size` (`id`, `desc`) VALUES
    ('XS', 'Extra Small (Hand Put)'),
    ('HS', 'Half Small'),
    ('S', 'Small'),
    ('M', 'Medium'),
    ('L', 'Large');

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_size_fkey` FOREIGN KEY (`size`) REFERENCES `Size`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pallet` ADD CONSTRAINT `Pallet_size_fkey` FOREIGN KEY (`size`) REFERENCES `Size`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
