import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    env: {
      GALLERY_SOURCE: 'mock', INSTAGRAM_LOCAL_OAUTH: 'true',
      INSTAGRAM_APP_ID: 'test-app', INSTAGRAM_APP_SECRET: 'test-secret',
      INSTAGRAM_REDIRECT_URI: 'http://127.0.0.1:3100/api/instagram/callback',
      INSTAGRAM_CONNECT_KEY: 'test-connect-key-for-local-tests-only',
      INSTAGRAM_SESSION_KEY: '0123456789abcdef'.repeat(4),
    },
    timeout: 60_000,
  },
});
