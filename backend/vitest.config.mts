import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os arquivos de integração criam e removem dados no mesmo MySQL.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
