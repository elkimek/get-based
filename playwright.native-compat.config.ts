import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';

// Keep the historical unbundled native resource diagnostic callable under its
// original policy. Shipping startup/first-use transfer uses performance:check.
export default defineConfig(base, {
  testDir: './tests/native-compat',
  outputDir: process.env.PLAYWRIGHT_NATIVE_COMPAT_OUTPUT_DIR || '/tmp/getbased-native-compat-results',
});
