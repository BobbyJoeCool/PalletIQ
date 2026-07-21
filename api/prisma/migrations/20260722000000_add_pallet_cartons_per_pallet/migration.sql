BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Pallet] ADD [cartonsPerPallet] INT NOT NULL CONSTRAINT [Pallet_cartonsPerPallet_df] DEFAULT 0;

-- Backfill: every pre-existing Pallet row gets cartonsPerPallet computed from its own
-- currentCartons/currentSSPs, same rounding rule the app applies at creation time
-- (v1.6.11, PAR redesign) — a flat +1 whole carton if there's any loose-SSP remainder at
-- all, not a ratio-based calculation. Run via sp_executesql for the same reason
-- 20260721000000_add_pallet_location_derived_fields's own backfill needed it: SQL Server
-- binds an entire batch's column references before executing any of it, so referencing
-- the column just added above, in the same batch, fails with "Invalid column name" without
-- deferring to a dynamically-compiled string.
EXEC sp_executesql N'
UPDATE [dbo].[Pallet]
SET [cartonsPerPallet] = [currentCartons] + CASE WHEN [currentSSPs] > 0 THEN 1 ELSE 0 END;
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
