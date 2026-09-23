'use strict'

const { defineConfig, devices } = require('@playwright/test')

const baseURL = 'http://localhost:5252'

module.exports = defineConfig({
  testDir: 'test',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // PREVIEW_ASSETS=bundle serves the published bundle's assets instead of the preview build
    command: process.env.PREVIEW_ASSETS === 'bundle' ? 'sh test/serve-bundle.sh' : 'node_modules/.bin/gulp preview',
    url: `${baseURL}/index.html`,
    reuseExistingServer: !process.env.CI && !process.env.PREVIEW_ASSETS,
    timeout: 120 * 1000,
  },
})
