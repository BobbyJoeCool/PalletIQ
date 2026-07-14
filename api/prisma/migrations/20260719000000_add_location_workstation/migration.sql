BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Workstation] (
    [id] NVARCHAR(4) NOT NULL,
    [desc] NVARCHAR(60) NOT NULL,
    CONSTRAINT [Workstation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AlterTable
ALTER TABLE [dbo].[Location] ADD [workstationCode] NVARCHAR(4);

-- AddForeignKey
ALTER TABLE [dbo].[Location] ADD CONSTRAINT [Location_workstationCode_fkey] FOREIGN KEY ([workstationCode]) REFERENCES [dbo].[Workstation]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed workstations, per Documentation/Flowcharts-ERDs/warehouse-layout.md's Workstation columns.
INSERT INTO [dbo].[Workstation] ([id], [desc]) VALUES
    (N'CR01', N'Conveyable Reserve — Aisles 304-310'),
    (N'FD01', N'Conveyable Food — Aisles 311-317'),
    (N'BK01', N'Breakpack — Aisles 318-324'),
    (N'NR01', N'Non-Conveyable Reserve — Aisles 325-331'),
    (N'NF01', N'Non-Conveyable Food — Aisles 332-338'),
    (N'XS01', N'XS Dense — Aisles 301-302'),
    (N'RS01', N'Restricted — Aisles 701, 702, 801-802'),
    (N'BS01', N'Security — Aisles 303, 803');

-- Assign each existing Location row's workstationCode from its aisle, per the same
-- source doc. Aisles not covered by warehouse-layout.md (if any exist) are left NULL.
UPDATE [dbo].[Location] SET [workstationCode] = N'CR01' WHERE [aisle] BETWEEN 304 AND 310;
UPDATE [dbo].[Location] SET [workstationCode] = N'FD01' WHERE [aisle] BETWEEN 311 AND 317;
UPDATE [dbo].[Location] SET [workstationCode] = N'BK01' WHERE [aisle] BETWEEN 318 AND 324;
UPDATE [dbo].[Location] SET [workstationCode] = N'NR01' WHERE [aisle] BETWEEN 325 AND 331;
UPDATE [dbo].[Location] SET [workstationCode] = N'NF01' WHERE [aisle] BETWEEN 332 AND 338;
UPDATE [dbo].[Location] SET [workstationCode] = N'XS01' WHERE [aisle] IN (301, 302);
UPDATE [dbo].[Location] SET [workstationCode] = N'RS01' WHERE [aisle] IN (701, 702, 801, 802);
UPDATE [dbo].[Location] SET [workstationCode] = N'BS01' WHERE [aisle] IN (303, 803);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
