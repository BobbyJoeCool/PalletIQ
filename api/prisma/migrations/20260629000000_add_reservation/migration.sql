BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Reservation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [locationAisle] INT NOT NULL,
    [locationBin] INT NOT NULL,
    [locationLevel] INT NOT NULL,
    [palletId] INT NOT NULL,
    [workerZ] NVARCHAR(7) NOT NULL,
    [targetAisle] INT NOT NULL,
    [targetSize] NVARCHAR(2),
    [targetStorage] NVARCHAR(2),
    [targetZone] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Reservation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Reservation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[Reservation] ADD CONSTRAINT [Reservation_location_fkey]
    FOREIGN KEY ([locationAisle], [locationBin], [locationLevel])
    REFERENCES [dbo].[Location]([aisle], [bin], [level])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Reservation] ADD CONSTRAINT [Reservation_pallet_fkey]
    FOREIGN KEY ([palletId]) REFERENCES [dbo].[Pallet]([pid])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Reservation] ADD CONSTRAINT [Reservation_worker_fkey]
    FOREIGN KEY ([workerZ]) REFERENCES [dbo].[User]([zNumber])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
