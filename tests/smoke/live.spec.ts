import { test, expect } from "@playwright/test";

// Served by the express `serve` (dist + ws on one port). /?live connects the
// client to /global/ws and watches the paced live game advance.
test("renders a live game and advances turns", async ({ page }) => {
  await page.goto("/?live");
  await expect(page.locator("polygon")).toHaveCount(127);
  const before = await page.getByTestId("turn-label").textContent();
  await page.waitForFunction(
    (b) => document.querySelector('[data-testid="turn-label"]')?.textContent !== b,
    before,
    { timeout: 15_000 },
  );
});
