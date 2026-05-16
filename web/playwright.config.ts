import { defineConfig, devices } from '@playwright/test';

// Vite dev server is configured for port 5174 (web/vite.config.ts) and is
// served over HTTPS via @vitejs/plugin-basic-ssl, hence the self-signed cert
// workaround below.
const BASE_URL = 'https://127.0.0.1:5174';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    ignoreHTTPSErrors: true,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_MOCK_AUTH: '1',
      // Local-dev Supabase defaults (same values as web/.env.example).
      // Inlined so E2E runs without requiring a pre-existing web/.env file.
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY
        ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      // Fall back to polling so E2E doesn't blow past the host's inotify
      // instance limit. Slightly higher CPU; only matters during test runs.
      CHOKIDAR_USEPOLLING: 'true',
      CHOKIDAR_INTERVAL: '1000',
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
