-- CreateTable
CREATE TABLE `StorageCode` (
    `id` VARCHAR(2) NOT NULL,
    `desc` VARCHAR(60) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Department` (
    `id` VARCHAR(3) NOT NULL,
    `name` VARCHAR(60) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HoldType` (
    `code` VARCHAR(3) NOT NULL,
    `desc` VARCHAR(20) NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PackingZone` (
    `id` INTEGER NOT NULL,
    `desc` VARCHAR(60) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Store` (
    `id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Workstation` (
    `id` VARCHAR(4) NOT NULL,
    `name` VARCHAR(60) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkstationAisle` (
    `aisle` INTEGER NOT NULL,
    `workstationId` VARCHAR(4) NOT NULL,

    PRIMARY KEY (`aisle`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Item` (
    `dept` INTEGER NOT NULL,
    `class` INTEGER NOT NULL,
    `item` INTEGER NOT NULL,
    `upc` VARCHAR(12) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `desc` TEXT NOT NULL,
    `descShort` VARCHAR(155) NOT NULL,
    `retailPrice` DECIMAL(10, 2) NOT NULL,
    `cost` DECIMAL(10, 2) NOT NULL,
    `packingZoneCode` INTEGER NOT NULL,
    `storageCode` VARCHAR(2) NOT NULL,
    `conveyable` BOOLEAN NOT NULL DEFAULT true,
    `requiresExpirationDate` BOOLEAN NOT NULL DEFAULT false,
    `unitWeight` DECIMAL(10, 2) NULL,

    UNIQUE INDEX `Item_upc_key`(`upc`),
    PRIMARY KEY (`dept`, `class`, `item`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Location` (
    `aisle` INTEGER NOT NULL,
    `bin` INTEGER NOT NULL,
    `level` INTEGER NOT NULL,
    `zone` INTEGER NOT NULL,
    `status` VARCHAR(15) NOT NULL,
    `holdTypeCode` VARCHAR(3) NULL,
    `storageCode` VARCHAR(2) NOT NULL,
    `size` VARCHAR(2) NOT NULL,
    `contraction` BOOLEAN NOT NULL DEFAULT false,
    `holdCategory` VARCHAR(10) NULL,

    PRIMARY KEY (`aisle`, `bin`, `level`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `zNumber` VARCHAR(7) NOT NULL,
    `firstName` VARCHAR(50) NOT NULL,
    `lastName` VARCHAR(50) NOT NULL,
    `pinHash` VARCHAR(60) NOT NULL,
    `role` VARCHAR(10) NOT NULL,
    `departmentId` VARCHAR(3) NOT NULL,

    PRIMARY KEY (`zNumber`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pallet` (
    `pid` INTEGER NOT NULL,
    `dept` INTEGER NOT NULL,
    `class` INTEGER NOT NULL,
    `item` INTEGER NOT NULL,
    `receivedPallets` INTEGER NOT NULL,
    `currentPallets` INTEGER NOT NULL,
    `receivedCartons` INTEGER NOT NULL,
    `currentCartons` INTEGER NOT NULL,
    `receivedSSPs` INTEGER NOT NULL,
    `currentSSPs` INTEGER NOT NULL,
    `cartonsPerPallet` INTEGER NOT NULL DEFAULT 0,
    `vcp` INTEGER NOT NULL,
    `ssp` INTEGER NOT NULL,
    `status` VARCHAR(15) NOT NULL,
    `locationAisle` INTEGER NULL,
    `locationBin` INTEGER NULL,
    `locationLevel` INTEGER NULL,
    `storageCode` VARCHAR(2) NULL,
    `size` VARCHAR(2) NULL,
    `zone` INTEGER NULL,
    `receivedByZ` VARCHAR(7) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `putByZ` VARCHAR(7) NULL,
    `putAt` DATETIME(3) NULL,
    `lastPulledByZ` VARCHAR(7) NULL,
    `lastPulledAt` DATETIME(3) NULL,
    `poNumber` VARCHAR(20) NULL,
    `apptNumber` VARCHAR(20) NULL,
    `expirationDate` DATE NULL,

    PRIMARY KEY (`pid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Label` (
    `lid` VARCHAR(36) NOT NULL,
    `pid` INTEGER NOT NULL,
    `dept` INTEGER NOT NULL,
    `class` INTEGER NOT NULL,
    `item` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `sspQuantity` INTEGER NOT NULL,
    `batchDate` INTEGER NOT NULL,
    `purgeDate` DATE NOT NULL,
    `destinationStore` INTEGER NOT NULL,
    `status` VARCHAR(15) NOT NULL,
    `pullFunction` VARCHAR(2) NOT NULL,

    PRIMARY KEY (`lid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reservation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `locationAisle` INTEGER NOT NULL,
    `locationBin` INTEGER NOT NULL,
    `locationLevel` INTEGER NOT NULL,
    `palletId` INTEGER NOT NULL,
    `workerZ` VARCHAR(7) NOT NULL,
    `targetAisle` INTEGER NOT NULL,
    `targetSize` VARCHAR(2) NULL,
    `targetStorage` VARCHAR(2) NULL,
    `targetZone` INTEGER NULL,
    `consolidating` BOOLEAN NOT NULL DEFAULT false,
    `pidWasScanned` BOOLEAN NULL,
    `wasStaged` BOOLEAN NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(7) NOT NULL,
    `actionType` VARCHAR(10) NOT NULL,
    `palletId` INTEGER NULL,
    `locationAisle` INTEGER NULL,
    `locationBin` INTEGER NULL,
    `locationLevel` INTEGER NULL,
    `dept` INTEGER NULL,
    `class` INTEGER NULL,
    `item` INTEGER NULL,
    `details` TEXT NULL,
    `functionCode` VARCHAR(3) NULL,

    INDEX `ActivityLog_userId_functionCode_timestamp_idx`(`userId`, `functionCode`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FunctionAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workerZ` VARCHAR(7) NOT NULL,
    `functionCode` VARCHAR(3) NOT NULL,
    `date` DATE NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `assignedByZ` VARCHAR(7) NOT NULL,

    INDEX `FunctionAssignment_workerZ_date_idx`(`workerZ`, `date`),
    INDEX `FunctionAssignment_functionCode_date_idx`(`functionCode`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProdGoal` (
    `functionCode` VARCHAR(3) NOT NULL,
    `rate` DECIMAL(10, 2) NOT NULL,
    `unit` VARCHAR(20) NOT NULL,
    `rate2` DECIMAL(10, 2) NULL,
    `unit2` VARCHAR(20) NULL,
    `effectiveDate` DATE NOT NULL,

    PRIMARY KEY (`functionCode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WorkstationAisle` ADD CONSTRAINT `WorkstationAisle_workstationId_fkey` FOREIGN KEY (`workstationId`) REFERENCES `Workstation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Item` ADD CONSTRAINT `Item_packingZoneCode_fkey` FOREIGN KEY (`packingZoneCode`) REFERENCES `PackingZone`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Item` ADD CONSTRAINT `Item_storageCode_fkey` FOREIGN KEY (`storageCode`) REFERENCES `StorageCode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_holdTypeCode_fkey` FOREIGN KEY (`holdTypeCode`) REFERENCES `HoldType`(`code`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_storageCode_fkey` FOREIGN KEY (`storageCode`) REFERENCES `StorageCode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pallet` ADD CONSTRAINT `Pallet_dept_class_item_fkey` FOREIGN KEY (`dept`, `class`, `item`) REFERENCES `Item`(`dept`, `class`, `item`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Pallet` ADD CONSTRAINT `Pallet_locationAisle_locationBin_locationLevel_fkey` FOREIGN KEY (`locationAisle`, `locationBin`, `locationLevel`) REFERENCES `Location`(`aisle`, `bin`, `level`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Pallet` ADD CONSTRAINT `Pallet_storageCode_fkey` FOREIGN KEY (`storageCode`) REFERENCES `StorageCode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pallet` ADD CONSTRAINT `Pallet_receivedByZ_fkey` FOREIGN KEY (`receivedByZ`) REFERENCES `User`(`zNumber`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Pallet` ADD CONSTRAINT `Pallet_putByZ_fkey` FOREIGN KEY (`putByZ`) REFERENCES `User`(`zNumber`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Pallet` ADD CONSTRAINT `Pallet_lastPulledByZ_fkey` FOREIGN KEY (`lastPulledByZ`) REFERENCES `User`(`zNumber`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Label` ADD CONSTRAINT `Label_pid_fkey` FOREIGN KEY (`pid`) REFERENCES `Pallet`(`pid`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Label` ADD CONSTRAINT `Label_dept_class_item_fkey` FOREIGN KEY (`dept`, `class`, `item`) REFERENCES `Item`(`dept`, `class`, `item`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Label` ADD CONSTRAINT `Label_destinationStore_fkey` FOREIGN KEY (`destinationStore`) REFERENCES `Store`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_locationAisle_locationBin_locationLevel_fkey` FOREIGN KEY (`locationAisle`, `locationBin`, `locationLevel`) REFERENCES `Location`(`aisle`, `bin`, `level`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_palletId_fkey` FOREIGN KEY (`palletId`) REFERENCES `Pallet`(`pid`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_workerZ_fkey` FOREIGN KEY (`workerZ`) REFERENCES `User`(`zNumber`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`zNumber`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_palletId_fkey` FOREIGN KEY (`palletId`) REFERENCES `Pallet`(`pid`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_locationAisle_locationBin_locationLevel_fkey` FOREIGN KEY (`locationAisle`, `locationBin`, `locationLevel`) REFERENCES `Location`(`aisle`, `bin`, `level`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_dept_class_item_fkey` FOREIGN KEY (`dept`, `class`, `item`) REFERENCES `Item`(`dept`, `class`, `item`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `FunctionAssignment` ADD CONSTRAINT `FunctionAssignment_workerZ_fkey` FOREIGN KEY (`workerZ`) REFERENCES `User`(`zNumber`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `FunctionAssignment` ADD CONSTRAINT `FunctionAssignment_assignedByZ_fkey` FOREIGN KEY (`assignedByZ`) REFERENCES `User`(`zNumber`) ON DELETE NO ACTION ON UPDATE NO ACTION;
