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

test("the per-cog replay route loads the replay (route-stable fetch, not stuck loading)", async ({ page }) => {
  // Regression: a relative ./replay.json fetch resolved to /cog/replay.json on
  // this nested route and never parsed, so the cog view hung on "Loading replay…".
  await page.goto("/cog/cog0");
  await expect(page.getByTestId("cog-view")).toBeVisible();
  await expect(page.locator("polygon")).toHaveCount(127); // board actually rendered
  await expect(page.getByTestId("inbox")).toBeVisible();
});
