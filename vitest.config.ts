import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts so tests don't load the PWA and Tailwind plugins.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // PBKDF2 runs 600k iterations per key; give crypto tests room on slow CI runners.
    testTimeout: 20_000,
  },
})
