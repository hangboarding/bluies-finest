import { defineConfig } from 'vitest/config';

// Two projects so date logic is exercised in both hemispheres:
//  - "london": the main user's zone (BST ends last Sunday of October, starts last Sunday of March)
//  - "sydney": southern hemisphere (AEDT starts first Sunday of October, ends first Sunday of April)
// TZ is also forced in tests/setup.ts before any Date is created, and tests/tz.test.ts asserts it took effect.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    projects: [
      {
        extends: true,
        test: { name: 'london', include: ['tests/**/*.test.ts'], exclude: ['tests/**/*.sydney.test.ts'], env: { TZ: 'Europe/London' } },
      },
      {
        extends: true,
        test: { name: 'sydney', include: ['tests/**/*.sydney.test.ts'], env: { TZ: 'Australia/Sydney' } },
      },
    ],
  },
});
