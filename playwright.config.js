import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT || '8000';
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';
const webGpuArgs = process.env.PLAYWRIGHT_WEBGPU === '1'
  ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan']
  : [];

export default defineConfig({
  testDir: './tests/playwright',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || '/tmp/getbased-playwright-results',
  fullyParallel: true,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    launchOptions: {
      ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', ...webGpuArgs],
    },
  },
  webServer: {
    command: `node dev-server.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    // Direct Playwright runs must not silently use app files from another
    // checkout. run-tests.sh opts in after starting a server it owns.
    reuseExistingServer,
    timeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
