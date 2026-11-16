-- Job/Function Assignment (Desktop, #145): shifts, home shifts, plan targets, ramping
-- overrides, assignment reasons, and the Roman demo roster.

-- CreateTable
CREATE TABLE `Shift` (
    `code` VARCHAR(2) NOT NULL,
    `daysLabel` VARCHAR(20) NOT NULL,
    `startTime` VARCHAR(5) NOT NULL,
    `endTime` VARCHAR(5) NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShiftBreak` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shiftCode` VARCHAR(2) NOT NULL,
    `startTime` VARCHAR(5) NOT NULL,
    `endTime` VARCHAR(5) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyPlanTarget` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `departmentId` VARCHAR(3) NOT NULL,
    `functionCode` VARCHAR(3) NOT NULL,
    `date` DATE NOT NULL,
    `shiftCode` VARCHAR(2) NOT NULL,
    `targetVolume` INTEGER NOT NULL,
    `unit` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `DailyPlanTarget_departmentId_functionCode_date_shiftCode_key`(`departmentId`, `functionCode`, `date`, `shiftCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RampingOverride` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workerZ` VARCHAR(7) NOT NULL,
    `functionCode` VARCHAR(3) NOT NULL,
    `percent` INTEGER NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `setByZ` VARCHAR(7) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RampingOverride_workerZ_functionCode_idx`(`workerZ`, `functionCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `homeShiftCode` VARCHAR(2) NULL;

-- AlterTable
ALTER TABLE `FunctionAssignment`
    ADD COLUMN `shiftCode` VARCHAR(2) NULL,
    ADD COLUMN `reasonCode` VARCHAR(3) NULL,
    ADD COLUMN `reasonText` VARCHAR(255) NULL;

-- The four fixed shifts (matches prisma/seed.ts and shared/workforce.ts).
INSERT INTO `Shift` (`code`, `daysLabel`, `startTime`, `endTime`) VALUES
    ('A1', 'SAT-MON', '06:00', '18:00'),
    ('A2', 'SAT-MON', '18:00', '06:00'),
    ('B1', 'TUE-FRI', '06:00', '16:00'),
    ('B2', 'TUE-FRI', '16:00', '02:00');

INSERT INTO `ShiftBreak` (`shiftCode`, `startTime`, `endTime`) VALUES
    ('A1', '10:00', '10:30'), ('A1', '14:15', '14:40'),
    ('A2', '22:00', '22:25'), ('A2', '02:10', '02:40'),
    ('B1', '09:00', '09:15'), ('B1', '12:20', '12:45'),
    ('B2', '19:00', '19:25'), ('B2', '23:20', '23:35');

-- Everyone already in the database works B1 (the weekday day shift) until told otherwise.
UPDATE `User` SET `homeShiftCode` = 'B1' WHERE `homeShiftCode` IS NULL;

-- Roman demo roster (direct instruction 2026-11-16): emperors as OMs and LWWs (desktop
-- password "Desktop1234"), notable Romans as team members; PIN 1234 for everyone.
INSERT INTO `User` (`zNumber`, `firstName`, `lastName`, `pinHash`, `passwordHash`, `role`, `departmentId`, `homeShiftCode`) VALUES
    ('z910m01', 'Augustus', 'Octavian', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG', 'MANAGER', 'WHS', 'A1'),
    ('z910l01', 'Tiberius', 'Caesar', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG', 'LEAD', 'WHS', 'A1'),
    ('z910l02', 'Claudius', 'Germanicus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG', 'LEAD', 'WHS', 'A1'),
    ('z810t01', 'Marcus', 'Cicero', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t02', 'Cato', 'Porcius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t03', 'Lucius', 'Seneca', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t04', 'Pliny', 'Elder', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t05', 'Pliny', 'Younger', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t06', 'Publius', 'Vergilius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t07', 'Quintus', 'Horatius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t08', 'Publius', 'Ovidius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t09', 'Titus', 'Livius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t10', 'Publius', 'Tacitus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t11', 'Gaius', 'Suetonius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t12', 'Decimus', 'Juvenalis', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t13', 'Marcus', 'Martialis', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t14', 'Gaius', 'Catullus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t15', 'Titus', 'Lucretius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t16', 'Livia', 'Drusilla', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t17', 'Cornelia', 'Africana', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t18', 'Octavia', 'Minor', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t19', 'Julia', 'Augusta', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t20', 'Portia', 'Catonis', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t21', 'Gaius', 'Sallustius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t22', 'Marcus', 'Varro', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t23', 'Marcus', 'Vitruvius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t24', 'Marcus', 'Agrippa', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z810t25', 'Gaius', 'Maecenas', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A1'),
    ('z920m01', 'Trajan', 'Ulpius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG', 'MANAGER', 'WHS', 'A2'),
    ('z920l01', 'Vespasian', 'Flavius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG', 'LEAD', 'WHS', 'A2'),
    ('z920l02', 'Titus', 'Flavius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG', 'LEAD', 'WHS', 'A2'),
    ('z820t01', 'Publius', 'Scipio', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t02', 'Gaius', 'Marius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t03', 'Lucius', 'Sulla', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t04', 'Gnaeus', 'Pompeius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t05', 'Marcus', 'Crassus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t06', 'Marcus', 'Antonius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t07', 'Marcus', 'Brutus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t08', 'Gaius', 'Cassius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t09', 'Tiberius', 'Gracchus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t10', 'Gaius', 'Gracchus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t11', 'Fulvia', 'Flacca', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t12', 'Clodia', 'Metelli', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t13', 'Hortensia', 'Oratrix', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t14', 'Agrippina', 'Elder', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t15', 'Agrippina', 'Younger', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t16', 'Quintus', 'Fabius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t17', 'Lucius', 'Cincinnatus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t18', 'Marcus', 'Camillus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t19', 'Gaius', 'Duilius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t20', 'Appius', 'Claudius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t21', 'Horatius', 'Cocles', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t22', 'Mucius', 'Scaevola', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t23', 'Gnaeus', 'Marcius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t24', 'Marcus', 'Regulus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z820t25', 'Lucius', 'Paullus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'A2'),
    ('z930m01', 'Hadrian', 'Aelius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG', 'MANAGER', 'WHS', 'B1'),
    ('z930l01', 'Nerva', 'Cocceius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG', 'LEAD', 'WHS', 'B1'),
    ('z930l02', 'Antoninus', 'Pius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG', 'LEAD', 'WHS', 'B1'),
    ('z830t01', 'Titus', 'Flamininus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t02', 'Gaius', 'Laelius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t03', 'Quintus', 'Metellus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t04', 'Lucius', 'Lucullus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t05', 'Quintus', 'Sertorius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t06', 'Spartacus', 'Thrax', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t07', 'Lucius', 'Catilina', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t08', 'Publius', 'Clodius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t09', 'Titus', 'Milo', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t10', 'Quintus', 'Hortensius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t11', 'Sulpicia', 'Poetria', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t12', 'Calpurnia', 'Pisonis', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t13', 'Servilia', 'Caepionis', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t14', 'Terentia', 'Ciceronis', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t15', 'Tullia', 'Ciceronis', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t16', 'Marcus', 'Lepidus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t17', 'Gnaeus', 'Agricola', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t18', 'Gnaeus', 'Corbulo', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t19', 'Germanicus', 'Julius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t20', 'Drusus', 'Claudius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t21', 'Gaius', 'Petronius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t22', 'Lucius', 'Apuleius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t23', 'Aulus', 'Gellius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t24', 'Marcus', 'Quintilianus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z830t25', 'Sextus', 'Frontinus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B1'),
    ('z940m01', 'Marcus', 'Aurelius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG', 'MANAGER', 'WHS', 'B2'),
    ('z940l01', 'Lucius', 'Verus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG', 'LEAD', 'WHS', 'B2'),
    ('z940l02', 'Septimius', 'Severus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', '$2b$10$GtsXjxCQaBaAcKfnNy5Cl.1gleZqIL9MzJAolJzI1Uhk/hx4/lyeG', 'LEAD', 'WHS', 'B2'),
    ('z840t01', 'Gaius', 'Columella', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t02', 'Aulus', 'Celsus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t03', 'Aelius', 'Galenus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t04', 'Claudius', 'Ptolemaeus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t05', 'Marcus', 'Fronto', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t06', 'Flavius', 'Arrianus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t07', 'Cassius', 'Dio', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t08', 'Ammianus', 'Marcellinus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t09', 'Aurelius', 'Augustinus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t10', 'Anicius', 'Boethius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t11', 'Pompeia', 'Plotina', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t12', 'Annia', 'Faustina', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t13', 'Aurelia', 'Cotta', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t14', 'Fabiola', 'Romana', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t15', 'Lucretia', 'Collatini', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t16', 'Flavius', 'Stilicho', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t17', 'Flavius', 'Aetius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t18', 'Flavius', 'Belisarius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t19', 'Flavius', 'Josephus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t20', 'Lucius', 'Mummius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t21', 'Quintus', 'Ennius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t22', 'Titus', 'Plautus', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t23', 'Publius', 'Terentius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t24', 'Cornelius', 'Nepos', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2'),
    ('z840t25', 'Decimus', 'Ausonius', '$2b$10$5EDW3ZmgFIO9hYM3NoN0WOlglcMoq4rzl.Ca4K5H6gnorjrTx6z9e', NULL, 'WORKER', 'WHS', 'B2');

-- Seeded ramping workers (open-ended), set by the demo admin.
INSERT INTO `RampingOverride` (`workerZ`, `functionCode`, `percent`, `startDate`, `endDate`, `setByZ`) VALUES
    ('z810t21', 'CA', 60, '2026-11-01', NULL, 'z002p25'),
    ('z810t22', 'CF', 75, '2026-11-01', NULL, 'z002p25'),
    ('z820t21', 'FP', 50, '2026-11-01', NULL, 'z002p25'),
    ('z820t22', 'CA', 80, '2026-11-01', NULL, 'z002p25'),
    ('z830t21', 'CA', 65, '2026-11-01', NULL, 'z002p25'),
    ('z830t22', 'RP', 70, '2026-11-01', NULL, 'z002p25'),
    ('z830t23', 'CF', 85, '2026-11-01', NULL, 'z002p25'),
    ('z840t21', 'HP', 55, '2026-11-01', NULL, 'z002p25');

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_homeShiftCode_fkey` FOREIGN KEY (`homeShiftCode`) REFERENCES `Shift`(`code`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ShiftBreak` ADD CONSTRAINT `ShiftBreak_shiftCode_fkey` FOREIGN KEY (`shiftCode`) REFERENCES `Shift`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `DailyPlanTarget` ADD CONSTRAINT `DailyPlanTarget_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `DailyPlanTarget` ADD CONSTRAINT `DailyPlanTarget_shiftCode_fkey` FOREIGN KEY (`shiftCode`) REFERENCES `Shift`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RampingOverride` ADD CONSTRAINT `RampingOverride_workerZ_fkey` FOREIGN KEY (`workerZ`) REFERENCES `User`(`zNumber`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `RampingOverride` ADD CONSTRAINT `RampingOverride_setByZ_fkey` FOREIGN KEY (`setByZ`) REFERENCES `User`(`zNumber`) ON DELETE NO ACTION ON UPDATE NO ACTION;
