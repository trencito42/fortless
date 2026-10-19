import { defineConfig } from 'vitest/config';

// Real Stripe TEST-mode run. No fake Stripe here; the file refuses to run unless the key is an sk_test_ key.
export default defineConfig({
  test: {
    include: ['tests/sandbox/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
