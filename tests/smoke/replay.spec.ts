import { test, expect } from "@playwright/test";

test("renders the lattice and scrubs", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("polygon")).toHaveCount(127);
  const before = await page.getByTestId("turn-label").textContent();
  await page.getByLabel("step forward").click();
  await expect(page.getByTestId("turn-label")).not.toHaveText(before ?? "");
});

test("shows the roster panel with named cogs", async ({ page }) => {
  await page.goto("/");
  const roster = page.getByTestId("roster");
  await expect(roster).toContainText("Alice");
  await expect(roster).toContainText("Bob");
  await expect(roster).toContainText("Carol");
  await expect(roster).toContainText("David");
  await page.screenshot({ path: "test-results/roster.png", fullPage: true });
});
