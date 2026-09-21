import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration suites share one database and truncate between tests, so
    // parallel files would delete each other's fixtures mid-run.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      /**
       * Scoped to what the UNIT suite is responsible for: logic that can be
       * exercised without a database.
       *
       * Deliberately excluded, and why:
       *  - auth/session.ts, auth/guards.ts, onboarding/payout.ts,
       *    tenant/loadSite.ts, checkout/** — their behaviour is database
       *    behaviour, and they are covered by tests/integration/**, which needs
       *    MONGODB_TEST_URI. Counting them here would report a low number for
       *    code that is tested, and tempt someone to write shallow mock-based
       *    tests to move it.
       *  - app/** — route handlers are thin wiring, verified end-to-end.
       *  - db/models/** — schema declarations.
       *
       * The combined figure requires a Mongo-enabled run. See
       * docs/tdd/phase-3-fee-engine.tdd.md.
       */
      include: [
        'src/lib/money/**',
        'src/lib/payments/**',
        'src/lib/paystack/**',
        'src/lib/db/plugins/**',
        'src/lib/tenant/context.ts',
        'src/lib/tenant/reserved.ts',
        'src/lib/tenant/resolveHost.ts',
        'src/lib/auth/password.ts',
        'src/lib/auth/cookies.ts',
        'src/lib/audit.ts',
        'src/lib/webhooks/paystackEvent.ts',
        'src/lib/export/**',
        'src/lib/http/query.ts',
      ],
      // Type-only modules emit no runtime code and only distort the report.
      exclude: ['**/types.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
