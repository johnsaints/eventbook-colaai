-- CreateTable
CREATE TABLE `organizer_staff` (
  `id` VARCHAR(191) NOT NULL,
  `organizerId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `organizer_staff_userId_idx`(`userId`),
  UNIQUE INDEX `organizer_staff_organizerId_userId_key`(`organizerId`, `userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `organizer_staff` ADD CONSTRAINT `organizer_staff_organizerId_fkey`
  FOREIGN KEY (`organizerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organizer_staff` ADD CONSTRAINT `organizer_staff_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
