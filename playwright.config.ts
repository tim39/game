import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          // @playwright/test is pinned to match the Chromium preinstalled in cloud sessions.
          // If they drift apart, point this at /opt/pw-browsers/chromium (see docs/TECH.md).
          executablePath: process.env.PW_CHROMIUM_PATH || undefined,
          // Software WebGL, so the game renders the same on machines without a GPU.
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
  // Tests run against a real production-style build. The e2e mode also switches on debug hooks.
  webServer: {
    command: `vite build --mode e2e --outDir dist-e2e && vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
