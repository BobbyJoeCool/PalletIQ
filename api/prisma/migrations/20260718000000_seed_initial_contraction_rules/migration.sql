BEGIN TRY

BEGIN TRAN;

-- Data-only migration (no schema change) — seeds initial Location.contraction values per
-- warehouse-ops request:
--   1. Every non-XS Level 1 location (Level 1 = ground; excludes XS, which is hand-put and
--      always Carton Air regardless of level).
--   2. Every HS-size location, at any level.
--   3. Every non-XS Level 10 location, at any (other) size — same XS exclusion as rule 1;
--      Level 10 is XS in aisles 301/302 (L10-13 falls in their XS-dense range) and in
--      801/802/803 (10 levels, all XS), so this needs the same carve-out.
--   4. Every odd-bin Level 8 location where size = 'S'.
-- Conditions are combined with OR since a location can independently match more than one
-- rule; all matching rows are simply set to contraction = 1 (rows already contracted are
-- unaffected).

UPDATE [dbo].[Location]
SET [contraction] = 1
WHERE ([size] <> 'XS' AND [level] = 1)
   OR ([size] = 'HS')
   OR ([size] <> 'XS' AND [level] = 10)
   OR ([size] = 'S' AND [level] = 8 AND [bin] % 2 = 1);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
