import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  timeout: 45000,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:8787',
    httpCredentials: {
      username: process.env.BASIC_AUTH_USER || 'local-test-user',
      password: process.env.BASIC_AUTH_PASSWORD || 'local-test-password',
    },
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
  },
});
