import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: process.env.WEB_E2E_BASE_URL ?? 'http://localhost:19137', trace: 'retain-on-failure' },
  webServer: process.env.WEB_E2E_BASE_URL ? undefined : {
    command: 'npx expo start --web --port 19137',
    url: 'http://localhost:19137',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:4100' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
