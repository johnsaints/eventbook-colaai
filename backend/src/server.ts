import { app } from './app.js';
import { env } from './config/env.js';
import { startOrderExpirationJob } from './modules/orders/orders.expiration.js';

app.listen(env.PORT, () => {
  console.log(`🚀 EventBook API rodando em http://localhost:${env.PORT}`);
  startOrderExpirationJob();
});
