import { defineConfig, devices } from "@playwright/test";

// On NixOS the downloaded browsers can't run; point this at a Nix-provided build instead:
//   export PLAYWRIGHT_BROWSERS_PATH=$(nix build --no-link --print-out-paths nixpkgs#playwright-driver.browsers)
// (nixpkgs' playwright-driver version must match @playwright/test.)
const PORT = 5179;

export default defineConfig({
  testDir: "./e2e/tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  outputDir: "e2e/results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"],
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Full Chromium in new-headless mode (also what nixpkgs ships; no headless shell there).
        channel: "chromium",
        viewport: { width: 1280, height: 800 },
        launchOptions: {
          args: [
            // Synthetic camera/mic (a test pattern + beep) and auto-accepted prompts,
            // including getDisplayMedia for screen sharing.
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            "--auto-select-desktop-capture-source=Entire screen",
            "--autoplay-policy=no-user-gesture-required",
            // Keep host ICE candidates as real IPs so two tabs can connect without TURN.
            "--disable-features=WebRtcHideLocalIpsWithMdns",
          ],
        },
      },
    },
  ],
  webServer: {
    command: `pnpm exec vite --config e2e/vite.config.ts --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
