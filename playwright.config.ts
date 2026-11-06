import { defineConfig } from '@playwright/test';

const live = process.env.FINBRIDGE_E2E_ORIGIN;
const baseURL = live ?? 'http://127.0.0.1:3100';
export default defineConfig({
  testDir: './test/e2e',
  timeout: 40_000,
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure',
  },
  webServer: live ? undefined : {
    command: 'pnpm start --hostname 127.0.0.1 --port 3100',
    url: baseURL + '/onboarding',
    reuseExistingServer: !process.env.CI,
  },
});
