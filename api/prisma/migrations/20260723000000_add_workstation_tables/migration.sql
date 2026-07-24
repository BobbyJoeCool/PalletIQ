BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Workstation] (
    [id] NVARCHAR(4) NOT NULL,
    [name] NVARCHAR(60) NOT NULL,
    CONSTRAINT [Workstation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[WorkstationAisle] (
    [aisle] INT NOT NULL,
    [workstationId] NVARCHAR(4) NOT NULL,
    CONSTRAINT [WorkstationAisle_pkey] PRIMARY KEY CLUSTERED ([aisle])
);

-- AddForeignKey
ALTER TABLE [dbo].[WorkstationAisle] ADD CONSTRAINT [WorkstationAisle_workstation_fkey]
    FOREIGN KEY ([workstationId]) REFERENCES [dbo].[Workstation]([id])
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
