-- CreateIndex
CREATE INDEX `ActivityLog_palletId_timestamp_idx` ON `ActivityLog`(`palletId`, `timestamp`);

-- CreateIndex
CREATE INDEX `ActivityLog_locationAisle_locationBin_locationLevel_timestam_idx` ON `ActivityLog`(`locationAisle`, `locationBin`, `locationLevel`, `timestamp`);
