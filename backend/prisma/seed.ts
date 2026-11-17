import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { seedDatabase } from '../src/config/seedDemo.js';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const seedPassword = process.env.SEED_PASSWORD || 'Password123!';
  await seedDatabase(prisma, seedPassword);
  console.log('✅ Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
