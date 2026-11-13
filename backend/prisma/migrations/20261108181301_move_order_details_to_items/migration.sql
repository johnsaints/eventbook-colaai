-- DropForeignKey
ALTER TABLE `orders` DROP FOREIGN KEY `orders_lotId_fkey`;

-- AlterTable
ALTER TABLE `orders` DROP COLUMN `lotId`,
    DROP COLUMN `quantity`,
    DROP COLUMN `unitPrice`,
    MODIFY `totalAmount` DECIMAL(20, 2) NOT NULL;
