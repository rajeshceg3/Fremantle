const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "tests",
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:8797",
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
    },
    screenshot: "only-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run preview -- --host 127.0.0.1 --port 8797",
        port: 8797,
        reuseExistingServer: false,
      },
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: process.env.RESULT || "verification/browser-results.json" },
    ],
  ],
});
