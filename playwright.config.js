import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: '/tmp/mereon-playwright-results',
  webServer: {
    command: 'npm run build:static && STATIC_ROOT=dist node tests/serve.mjs',
    url: 'http://127.0.0.1:8766',
    reuseExistingServer: false,
    timeout: 10_000
  },
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:8766',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'mobile-320', use: { viewport: { width: 320, height: 700 } } }
  ]
});
