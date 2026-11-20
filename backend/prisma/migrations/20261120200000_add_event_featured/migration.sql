-- AlterTable
ALTER TABLE `events` ADD COLUMN `featured` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `events_status_featured_startsAt_idx` ON `events`(`status`, `featured`, `startsAt`);
