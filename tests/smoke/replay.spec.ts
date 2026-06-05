import { test, expect } from "@playwright/test";

test("renders the lattice and scrubs", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("polygon")).toHaveCount(127);
  const before = await page.getByTestId("turn-label").textContent();
  await page.getByLabel("step forward").click();
  await expect(page.getByTestId("turn-label")).not.toHaveText(before ?? "");
});
