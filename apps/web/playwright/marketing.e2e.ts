import process from "node:process";
import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";

if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
  test.use({
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  });
}

test.describe("Convenio marketing layout", () => {
  test("marketing heroes retain viewport gutters", async ({ page }) => {
    await page.setViewportSize({ width: 996, height: 918 });
    await page.goto("/");

    const headline = page.locator(".cv-hero h1");
    await expect(headline).toBeVisible();
    await expect.poll(async () => (await headline.boundingBox())?.x ?? 0).toBeGreaterThanOrEqual(24);
  });
});
