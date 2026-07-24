BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[ActivityLog] ADD [functionCode] NVARCHAR(3);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ActivityLog_userId_functionCode_timestamp_idx] ON [dbo].[ActivityLog]([userId], [functionCode], [timestamp]);

-- CreateTable
CREATE TABLE [dbo].[FunctionAssignment] (
    [id] INT NOT NULL IDENTITY(1,1),
    [workerZ] NVARCHAR(7) NOT NULL,
    [functionCode] NVARCHAR(3) NOT NULL,
    [date] DATE NOT NULL,
    [startTime] DATETIME2 NOT NULL,
    [endTime] DATETIME2 NOT NULL,
    [assignedByZ] NVARCHAR(7) NOT NULL,
    CONSTRAINT [FunctionAssignment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FunctionAssignment_workerZ_date_idx] ON [dbo].[FunctionAssignment]([workerZ], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FunctionAssignment_functionCode_date_idx] ON [dbo].[FunctionAssignment]([functionCode], [date]);

-- AddForeignKey
ALTER TABLE [dbo].[FunctionAssignment] ADD CONSTRAINT [FunctionAssignment_worker_fkey]
    FOREIGN KEY ([workerZ]) REFERENCES [dbo].[User]([zNumber])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FunctionAssignment] ADD CONSTRAINT [FunctionAssignment_assignedBy_fkey]
    FOREIGN KEY ([assignedByZ]) REFERENCES [dbo].[User]([zNumber])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateTable
CREATE TABLE [dbo].[ProdGoal] (
    [functionCode] NVARCHAR(3) NOT NULL,
    [rate] DECIMAL(10,2) NOT NULL,
    [unit] NVARCHAR(20) NOT NULL,
    [rate2] DECIMAL(10,2),
    [unit2] NVARCHAR(20),
    [effectiveDate] DATE NOT NULL,
    CONSTRAINT [ProdGoal_pkey] PRIMARY KEY CLUSTERED ([functionCode])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
