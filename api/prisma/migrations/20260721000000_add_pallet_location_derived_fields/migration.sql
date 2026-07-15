BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Pallet] ADD [storageCode] NVARCHAR(2) NULL;
ALTER TABLE [dbo].[Pallet] ADD [size] NVARCHAR(2) NULL;
ALTER TABLE [dbo].[Pallet] ADD [zone] INT NULL;

-- AlterTable
ALTER TABLE [dbo].[Reservation] ADD [wasStaged] BIT NULL;

-- AddForeignKey
ALTER TABLE [dbo].[Pallet] ADD CONSTRAINT [Pallet_storageCode_fkey] FOREIGN KEY ([storageCode]) REFERENCES [dbo].[StorageCode]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Backfill: every currently-STORED pallet's storageCode/size/zone copied from the
-- Location it's actually sitting in. Pallets with no location (PUT_PENDING) are left
-- NULL — nothing to inherit. Reservation.wasStaged is left NULL for any in-flight
-- reservation that predates this migration (none expected in practice — reservations
-- are short-lived — but nullable for safety regardless).
--
-- Run via sp_executesql: SQL Server binds an entire batch's column references before
-- executing any of it, so referencing storageCode/size/zone directly here (added by the
-- ALTER TABLE statements just above, in the same batch) fails with "Invalid column name"
-- even though those statements already ran. A dynamic-SQL string is compiled separately at
-- execution time instead, by which point the new columns already exist in this
-- transaction/session (Prisma's SQL Server executor sends this whole file as a single
-- batch — it does not split on GO, so a real batch separator isn't an option here).
EXEC sp_executesql N'
UPDATE p
SET p.[storageCode] = l.[storageCode],
    p.[size]        = l.[size],
    p.[zone]        = l.[zone]
FROM [dbo].[Pallet] p
INNER JOIN [dbo].[Location] l
    ON p.[locationAisle] = l.[aisle]
    AND p.[locationBin]   = l.[bin]
    AND p.[locationLevel] = l.[level]
WHERE p.[locationAisle] IS NOT NULL;
';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
