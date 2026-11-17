import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { seedDatabase } from './config/seedDemo.js';
import { startOrderExpirationJob } from './modules/orders/orders.expiration.js';

async function seedDemoIfEmpty() {
  if (!env.SEED_ON_EMPTY) return;
  if (!env.SEED_PASSWORD) {
    console.warn(JSON.stringify({ event: 'seed_skipped', reason: 'SEED_PASSWORD_NOT_SET' }));
    return;
  }

  const userCount = await prisma.user.count();
  if (userCount > 0) return;

  await seedDatabase(prisma, env.SEED_PASSWORD);
  console.info(JSON.stringify({ event: 'seed_completed_on_empty_db' }));
}

app.listen(env.PORT, () => {
  console.log(`🚀 EventBook API rodando em http://localhost:${env.PORT}`);
  startOrderExpirationJob();
  void seedDemoIfEmpty().catch((error: unknown) => {
    console.error(JSON.stringify({ event: 'seed_failed', error: String(error) }));
  });
});
