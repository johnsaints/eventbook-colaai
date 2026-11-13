-- CreateTable
CREATE TABLE `order_items` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `lotId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitPriceSnapshot` DECIMAL(10, 2) NOT NULL,

    INDEX `order_items_lotId_idx`(`lotId`),
    UNIQUE INDEX `order_items_orderId_lotId_key`(`orderId`, `lotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_lotId_fkey` FOREIGN KEY (`lotId`) REFERENCES `ticket_lots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Copia os dados de cada pedido antigo para seu primeiro item.
INSERT INTO `order_items` (`id`, `orderId`, `lotId`, `quantity`, `unitPriceSnapshot`)
SELECT `id`, `id`, `lotId`, `quantity`, `unitPrice` FROM `orders`;
