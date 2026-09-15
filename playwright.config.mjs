import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: "http://localhost:8000", headless: true },
  webServer: {
    command: "python -m http.server 8000 --bind 127.0.0.1",
    url: "http://localhost:8000/crm/",
    reuseExistingServer: true,
  },
  reporter: "list",
});
