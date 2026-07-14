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

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
