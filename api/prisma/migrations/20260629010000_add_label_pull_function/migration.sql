-- Add pullFunction column to Label table.
-- CA = Carton Air, CF = Carton Floor, FP = Full Pallet, BK = Bulk (deferred)
ALTER TABLE [dbo].[Label]
  ADD [pullFunction] NVARCHAR(2) NOT NULL DEFAULT 'CA';
