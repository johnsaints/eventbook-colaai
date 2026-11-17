-- AlterTable
ALTER TABLE `users`
  ADD COLUMN `phone` VARCHAR(191) NULL,
  ADD COLUMN `city` VARCHAR(191) NULL,
  ADD COLUMN `bio` VARCHAR(280) NULL,
  ADD COLUMN `avatarImage` MEDIUMTEXT NULL;

-- CreateTable
CREATE TABLE `magic_link_tokens` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `magic_link_tokens_tokenHash_key`(`tokenHash`),
  INDEX `magic_link_tokens_userId_idx`(`userId`),
  INDEX `magic_link_tokens_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `magic_link_tokens` ADD CONSTRAINT `magic_link_tokens_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
