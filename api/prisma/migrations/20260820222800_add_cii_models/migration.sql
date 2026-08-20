-- AlterTable
ALTER TABLE `Container` ADD COLUMN `breakpackOrigin` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `ContainerEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `containerId` VARCHAR(36) NOT NULL,
    `eventType` VARCHAR(15) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userZ` VARCHAR(7) NULL,
    `reasonPrefix` VARCHAR(1) NULL,
    `reasonNumber` VARCHAR(2) NULL,
    `reasonNote` VARCHAR(255) NULL,

    INDEX `ContainerEvent_containerId_timestamp_idx`(`containerId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScanLog` (
    `id` VARCHAR(36) NOT NULL,
    `zNumber` VARCHAR(7) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actionType` VARCHAR(20) NOT NULL,
    `details` TEXT NOT NULL,

    INDEX `ScanLog_zNumber_timestamp_idx`(`zNumber`, `timestamp`),
    INDEX `ScanLog_actionType_timestamp_idx`(`actionType`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Overpack` (
    `cid` VARCHAR(36) NOT NULL,
    `destinationStore` INTEGER NOT NULL,
    `open` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `purgeDate` DATETIME(3) NOT NULL,
    `purgedAt` DATETIME(3) NULL,
    `closedByZ` VARCHAR(7) NULL,
    `closedAt` DATETIME(3) NULL,

    PRIMARY KEY (`cid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OverpackContent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `overpackCid` VARCHAR(36) NOT NULL,
    `childCid` VARCHAR(36) NOT NULL,
    `childType` VARCHAR(20) NOT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OverpackContent_overpackCid_idx`(`overpackCid`),
    UNIQUE INDEX `OverpackContent_childCid_key`(`childCid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OverpackPlacementEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `overpackCid` VARCHAR(36) NOT NULL,
    `childCid` VARCHAR(36) NOT NULL,
    `childType` VARCHAR(20) NOT NULL,
    `eventType` VARCHAR(10) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OverpackPlacementEvent_childCid_timestamp_idx`(`childCid`, `timestamp`),
    INDEX `OverpackPlacementEvent_overpackCid_timestamp_idx`(`overpackCid`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SSPUnit` (
    `cid` VARCHAR(36) NOT NULL,
    `sourceContainerId` VARCHAR(36) NOT NULL,
    `dept` INTEGER NOT NULL,
    `class` INTEGER NOT NULL,
    `item` INTEGER NOT NULL,
    `destinationStore` INTEGER NOT NULL,
    `standardEachQty` INTEGER NOT NULL,
    `actualEachQty` INTEGER NOT NULL,
    `status` VARCHAR(15) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `packedAt` DATETIME(3) NULL,
    `canceledAt` DATETIME(3) NULL,

    INDEX `SSPUnit_sourceContainerId_idx`(`sourceContainerId`),
    PRIMARY KEY (`cid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SSPUnitAdjustmentEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `unitCid` VARCHAR(36) NOT NULL,
    `previousQty` INTEGER NOT NULL,
    `newQty` INTEGER NOT NULL,
    `adjustedByZ` VARCHAR(7) NOT NULL,
    `adjustedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SSPUnitAdjustmentEvent_unitCid_idx`(`unitCid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StrayEach` (
    `cid` VARCHAR(36) NOT NULL,
    `dept` INTEGER NOT NULL,
    `class` INTEGER NOT NULL,
    `item` INTEGER NOT NULL,
    `eachQty` INTEGER NOT NULL,
    `destinationStore` INTEGER NOT NULL,
    `foundByZ` VARCHAR(7) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(15) NOT NULL,
    `packedAt` DATETIME(3) NULL,
    `canceledAt` DATETIME(3) NULL,

    PRIMARY KEY (`cid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OverpackStatusEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `overpackCid` VARCHAR(36) NOT NULL,
    `eventType` VARCHAR(15) NOT NULL,
    `reasonPrefix` VARCHAR(1) NULL,
    `reasonNumber` VARCHAR(2) NULL,
    `reasonNote` VARCHAR(255) NULL,
    `userZ` VARCHAR(7) NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OverpackStatusEvent_overpackCid_timestamp_idx`(`overpackCid`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StrayEachReassignmentEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `strayEachCid` VARCHAR(36) NOT NULL,
    `previousStore` INTEGER NOT NULL,
    `newStore` INTEGER NOT NULL,
    `reasonPrefix` VARCHAR(1) NOT NULL,
    `reasonNumber` VARCHAR(2) NOT NULL,
    `reasonNote` VARCHAR(255) NULL,
    `reassignedByZ` VARCHAR(7) NOT NULL,
    `reassignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StrayEachReassignmentEvent_strayEachCid_reassignedAt_idx`(`strayEachCid`, `reassignedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContainerCancelEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cid` VARCHAR(36) NOT NULL,
    `containerType` VARCHAR(15) NOT NULL,
    `triggerType` VARCHAR(20) NOT NULL,
    `triggerId` VARCHAR(36) NOT NULL,
    `reasonPrefix` VARCHAR(1) NULL,
    `reasonNumber` VARCHAR(2) NULL,
    `reasonNote` VARCHAR(255) NULL,
    `canceledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContainerCancelEvent_cid_idx`(`cid`),
    INDEX `ContainerCancelEvent_triggerType_triggerId_idx`(`triggerType`, `triggerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ContainerEvent` ADD CONSTRAINT `ContainerEvent_containerId_fkey` FOREIGN KEY (`containerId`) REFERENCES `Container`(`cid`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ContainerEvent` ADD CONSTRAINT `ContainerEvent_userZ_fkey` FOREIGN KEY (`userZ`) REFERENCES `User`(`zNumber`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ContainerEvent` ADD CONSTRAINT `ContainerEvent_reasonPrefix_fkey` FOREIGN KEY (`reasonPrefix`) REFERENCES `ReasonCodePrefix`(`letter`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ContainerEvent` ADD CONSTRAINT `ContainerEvent_reasonNumber_fkey` FOREIGN KEY (`reasonNumber`) REFERENCES `ReasonCode`(`number`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ScanLog` ADD CONSTRAINT `ScanLog_zNumber_fkey` FOREIGN KEY (`zNumber`) REFERENCES `User`(`zNumber`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Overpack` ADD CONSTRAINT `Overpack_destinationStore_fkey` FOREIGN KEY (`destinationStore`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OverpackContent` ADD CONSTRAINT `OverpackContent_overpackCid_fkey` FOREIGN KEY (`overpackCid`) REFERENCES `Overpack`(`cid`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SSPUnit` ADD CONSTRAINT `SSPUnit_sourceContainerId_fkey` FOREIGN KEY (`sourceContainerId`) REFERENCES `Container`(`cid`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SSPUnit` ADD CONSTRAINT `SSPUnit_dept_class_item_fkey` FOREIGN KEY (`dept`, `class`, `item`) REFERENCES `Item`(`dept`, `class`, `item`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SSPUnit` ADD CONSTRAINT `SSPUnit_destinationStore_fkey` FOREIGN KEY (`destinationStore`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SSPUnitAdjustmentEvent` ADD CONSTRAINT `SSPUnitAdjustmentEvent_unitCid_fkey` FOREIGN KEY (`unitCid`) REFERENCES `SSPUnit`(`cid`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SSPUnitAdjustmentEvent` ADD CONSTRAINT `SSPUnitAdjustmentEvent_adjustedByZ_fkey` FOREIGN KEY (`adjustedByZ`) REFERENCES `User`(`zNumber`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StrayEach` ADD CONSTRAINT `StrayEach_dept_class_item_fkey` FOREIGN KEY (`dept`, `class`, `item`) REFERENCES `Item`(`dept`, `class`, `item`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StrayEach` ADD CONSTRAINT `StrayEach_destinationStore_fkey` FOREIGN KEY (`destinationStore`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OverpackStatusEvent` ADD CONSTRAINT `OverpackStatusEvent_overpackCid_fkey` FOREIGN KEY (`overpackCid`) REFERENCES `Overpack`(`cid`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OverpackStatusEvent` ADD CONSTRAINT `OverpackStatusEvent_userZ_fkey` FOREIGN KEY (`userZ`) REFERENCES `User`(`zNumber`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OverpackStatusEvent` ADD CONSTRAINT `OverpackStatusEvent_reasonPrefix_fkey` FOREIGN KEY (`reasonPrefix`) REFERENCES `ReasonCodePrefix`(`letter`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `OverpackStatusEvent` ADD CONSTRAINT `OverpackStatusEvent_reasonNumber_fkey` FOREIGN KEY (`reasonNumber`) REFERENCES `ReasonCode`(`number`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `StrayEachReassignmentEvent` ADD CONSTRAINT `StrayEachReassignmentEvent_strayEachCid_fkey` FOREIGN KEY (`strayEachCid`) REFERENCES `StrayEach`(`cid`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StrayEachReassignmentEvent` ADD CONSTRAINT `StrayEachReassignmentEvent_reassignedByZ_fkey` FOREIGN KEY (`reassignedByZ`) REFERENCES `User`(`zNumber`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StrayEachReassignmentEvent` ADD CONSTRAINT `StrayEachReassignmentEvent_reasonPrefix_fkey` FOREIGN KEY (`reasonPrefix`) REFERENCES `ReasonCodePrefix`(`letter`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `StrayEachReassignmentEvent` ADD CONSTRAINT `StrayEachReassignmentEvent_reasonNumber_fkey` FOREIGN KEY (`reasonNumber`) REFERENCES `ReasonCode`(`number`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ContainerCancelEvent` ADD CONSTRAINT `ContainerCancelEvent_reasonPrefix_fkey` FOREIGN KEY (`reasonPrefix`) REFERENCES `ReasonCodePrefix`(`letter`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ContainerCancelEvent` ADD CONSTRAINT `ContainerCancelEvent_reasonNumber_fkey` FOREIGN KEY (`reasonNumber`) REFERENCES `ReasonCode`(`number`) ON DELETE NO ACTION ON UPDATE NO ACTION;
