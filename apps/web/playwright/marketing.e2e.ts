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

  test("pricing uses the marketing shell and yearly-first hierarchy", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/pricing");

    await expect(page.locator(".cv-header")).toBeVisible();
    const pricingLink = page.getByRole("banner").getByRole("link", { name: "Pricing" });
    await expect(pricingLink).toHaveAttribute("aria-current", "page");
    await expect(pricingLink).toBeInViewport();
    await expect(page.getByRole("banner").getByRole("link", { name: "Get started" })).toBeInViewport();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await expect(page.getByRole("heading", { name: "Pro" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Free" })).toHaveCount(0);
    await expect(page.getByText("$96")).toBeVisible();
  });
});
