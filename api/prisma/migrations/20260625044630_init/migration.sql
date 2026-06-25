BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[StorageCode] (
    [id] NVARCHAR(2) NOT NULL,
    [desc] NVARCHAR(60) NOT NULL,
    CONSTRAINT [StorageCode_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Department] (
    [id] NVARCHAR(3) NOT NULL,
    [name] NVARCHAR(20) NOT NULL,
    CONSTRAINT [Department_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[HoldType] (
    [code] NVARCHAR(3) NOT NULL,
    [desc] NVARCHAR(20) NOT NULL,
    CONSTRAINT [HoldType_pkey] PRIMARY KEY CLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[PackingZone] (
    [id] INT NOT NULL,
    [desc] NVARCHAR(60) NOT NULL,
    CONSTRAINT [PackingZone_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Store] (
    [id] INT NOT NULL,
    [name] NVARCHAR(40) NOT NULL,
    CONSTRAINT [Store_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Item] (
    [dept] INT NOT NULL,
    [class] INT NOT NULL,
    [item] INT NOT NULL,
    [upc] NVARCHAR(12) NOT NULL,
    [name] NVARCHAR(50) NOT NULL,
    [desc] NVARCHAR(max) NOT NULL,
    [descShort] NVARCHAR(155) NOT NULL,
    [retailPrice] DECIMAL(10,2) NOT NULL,
    [cost] DECIMAL(10,2) NOT NULL,
    [packingZoneCode] INT NOT NULL,
    [storageCode] NVARCHAR(2) NOT NULL,
    [conveyable] BIT NOT NULL CONSTRAINT [Item_conveyable_df] DEFAULT 1,
    CONSTRAINT [Item_pkey] PRIMARY KEY CLUSTERED ([dept],[class],[item]),
    CONSTRAINT [Item_upc_key] UNIQUE NONCLUSTERED ([upc])
);

-- CreateTable
CREATE TABLE [dbo].[Location] (
    [aisle] INT NOT NULL,
    [bin] INT NOT NULL,
    [level] INT NOT NULL,
    [zone] INT NOT NULL,
    [status] NVARCHAR(15) NOT NULL,
    [holdTypeCode] NVARCHAR(3),
    [storageCode] NVARCHAR(2) NOT NULL,
    [size] NVARCHAR(2) NOT NULL,
    CONSTRAINT [Location_pkey] PRIMARY KEY CLUSTERED ([aisle],[bin],[level])
);

-- CreateTable
CREATE TABLE [dbo].[User] (
    [zNumber] NVARCHAR(7) NOT NULL,
    [firstName] NVARCHAR(50) NOT NULL,
    [lastName] NVARCHAR(50) NOT NULL,
    [pinHash] NVARCHAR(60) NOT NULL,
    [role] NVARCHAR(10) NOT NULL,
    [departmentId] NVARCHAR(3) NOT NULL,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([zNumber])
);

-- CreateTable
CREATE TABLE [dbo].[Pallet] (
    [pid] INT NOT NULL,
    [dept] INT NOT NULL,
    [class] INT NOT NULL,
    [item] INT NOT NULL,
    [receivedPallets] INT NOT NULL,
    [currentPallets] INT NOT NULL,
    [receivedCartons] INT NOT NULL,
    [currentCartons] INT NOT NULL,
    [receivedSSPs] INT NOT NULL,
    [currentSSPs] INT NOT NULL,
    [vcp] INT NOT NULL,
    [ssp] INT NOT NULL,
    [status] NVARCHAR(15) NOT NULL,
    [locationAisle] INT,
    [locationBin] INT,
    [locationLevel] INT,
    [receivedByZ] NVARCHAR(7) NOT NULL,
    [receivedAt] DATETIME2 NOT NULL,
    [putByZ] NVARCHAR(7),
    [putAt] DATETIME2,
    [lastPulledByZ] NVARCHAR(7),
    [lastPulledAt] DATETIME2,
    CONSTRAINT [Pallet_pkey] PRIMARY KEY CLUSTERED ([pid])
);

-- CreateTable
CREATE TABLE [dbo].[Label] (
    [lid] NVARCHAR(36) NOT NULL,
    [pid] INT NOT NULL,
    [dept] INT NOT NULL,
    [class] INT NOT NULL,
    [item] INT NOT NULL,
    [quantity] INT NOT NULL,
    [sspQuantity] INT NOT NULL,
    [batchDate] INT NOT NULL,
    [purgeDate] DATE NOT NULL,
    [destinationStore] INT NOT NULL,
    [status] NVARCHAR(15) NOT NULL,
    CONSTRAINT [Label_pkey] PRIMARY KEY CLUSTERED ([lid])
);

-- CreateTable
CREATE TABLE [dbo].[ActivityLog] (
    [id] INT NOT NULL IDENTITY(1,1),
    [timestamp] DATETIME2 NOT NULL CONSTRAINT [ActivityLog_timestamp_df] DEFAULT CURRENT_TIMESTAMP,
    [userId] NVARCHAR(7) NOT NULL,
    [actionType] NVARCHAR(10) NOT NULL,
    [palletId] INT,
    [locationAisle] INT,
    [locationBin] INT,
    [locationLevel] INT,
    [dept] INT,
    [class] INT,
    [item] INT,
    [details] NVARCHAR(max),
    CONSTRAINT [ActivityLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[Item] ADD CONSTRAINT [Item_packingZoneCode_fkey] FOREIGN KEY ([packingZoneCode]) REFERENCES [dbo].[PackingZone]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Item] ADD CONSTRAINT [Item_storageCode_fkey] FOREIGN KEY ([storageCode]) REFERENCES [dbo].[StorageCode]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Location] ADD CONSTRAINT [Location_holdTypeCode_fkey] FOREIGN KEY ([holdTypeCode]) REFERENCES [dbo].[HoldType]([code]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Location] ADD CONSTRAINT [Location_storageCode_fkey] FOREIGN KEY ([storageCode]) REFERENCES [dbo].[StorageCode]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Pallet] ADD CONSTRAINT [Pallet_dept_class_item_fkey] FOREIGN KEY ([dept], [class], [item]) REFERENCES [dbo].[Item]([dept],[class],[item]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Pallet] ADD CONSTRAINT [Pallet_locationAisle_locationBin_locationLevel_fkey] FOREIGN KEY ([locationAisle], [locationBin], [locationLevel]) REFERENCES [dbo].[Location]([aisle],[bin],[level]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Pallet] ADD CONSTRAINT [Pallet_receivedByZ_fkey] FOREIGN KEY ([receivedByZ]) REFERENCES [dbo].[User]([zNumber]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Pallet] ADD CONSTRAINT [Pallet_putByZ_fkey] FOREIGN KEY ([putByZ]) REFERENCES [dbo].[User]([zNumber]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Pallet] ADD CONSTRAINT [Pallet_lastPulledByZ_fkey] FOREIGN KEY ([lastPulledByZ]) REFERENCES [dbo].[User]([zNumber]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Label] ADD CONSTRAINT [Label_pid_fkey] FOREIGN KEY ([pid]) REFERENCES [dbo].[Pallet]([pid]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Label] ADD CONSTRAINT [Label_dept_class_item_fkey] FOREIGN KEY ([dept], [class], [item]) REFERENCES [dbo].[Item]([dept],[class],[item]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Label] ADD CONSTRAINT [Label_destinationStore_fkey] FOREIGN KEY ([destinationStore]) REFERENCES [dbo].[Store]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ActivityLog] ADD CONSTRAINT [ActivityLog_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([zNumber]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ActivityLog] ADD CONSTRAINT [ActivityLog_palletId_fkey] FOREIGN KEY ([palletId]) REFERENCES [dbo].[Pallet]([pid]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ActivityLog] ADD CONSTRAINT [ActivityLog_locationAisle_locationBin_locationLevel_fkey] FOREIGN KEY ([locationAisle], [locationBin], [locationLevel]) REFERENCES [dbo].[Location]([aisle],[bin],[level]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ActivityLog] ADD CONSTRAINT [ActivityLog_dept_class_item_fkey] FOREIGN KEY ([dept], [class], [item]) REFERENCES [dbo].[Item]([dept],[class],[item]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
