import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const carouselFile = resolve(".tmp/playwright-workspace/carousels/welcome/carousel.yaml");
const imageFile = resolve(".tmp/playwright-workspace/assets/landscape.svg");

test("lists a carousel and renders every slide at 4:5", async ({ page }) => {
  await page.goto("/");
  const fontsLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      inter: document.fonts.check('400 16px "Inter"'),
      serif: document.fonts.check('700 16px "Source Serif 4"')
    };
  });
  expect(fontsLoaded).toEqual({ inter: true, serif: true });
  const card = page.getByRole("link", { name: /Welcome to Slip/ });
  await expect(card).toContainText("3 slides");
  await expect(card).toContainText(/updated/i);
  await card.click();

  await expect(page.getByRole("heading", { name: "Welcome to Slip" })).toBeVisible();
  await expect(page.getByTestId("slide")).toHaveCount(3);
  const ratio = await page.getByTestId("slide").first().evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.width / box.height;
  });
  expect(ratio).toBeCloseTo(4 / 5, 2);
  await expect(page.getByTestId("slide").first().locator("svg")).toHaveAttribute("width", "1080");
  await expect(page.getByTestId("slide").first().locator("svg")).toHaveAttribute("height", "1350");
  const resourceIds = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="slide"] svg [id]'), (element) => element.id)
  );
  expect(resourceIds.length).toBeGreaterThan(0);
  expect(new Set(resourceIds).size).toBe(resourceIds.length);
});

test("referenced image changes refresh the photographic preview", async ({ page }) => {
  await page.goto("/?carousel=welcome");
  const photograph = page.getByTestId("slide").nth(2).locator("svg");
  const before = await photograph.innerHTML();
  try {
    await writeFile(
      imageFile,
      '<svg xmlns="http://www.w3.org/2000/svg" width="5400" height="3600"><rect width="5400" height="3600" fill="#a44f38"/></svg>'
    );
    await expect.poll(async () => photograph.innerHTML()).not.toBe(before);
  } finally {
    await writeFile(
      imageFile,
      '<svg xmlns="http://www.w3.org/2000/svg" width="5400" height="3600"><rect width="5400" height="3600" fill="#315f45"/></svg>'
    );
  }
});

test("valid changes refresh and invalid content preserves the last valid preview", async ({ page }) => {
  await page.goto("/?carousel=welcome");
  await expect(page.getByLabel("Slide 1: Make the idea clear")).toBeVisible();
  const original = await readFile(carouselFile, "utf8");
  const valid = original.replace("Make the idea clear", "A valid live update");
  await writeFile(carouselFile, valid);
  await expect(page.getByLabel("Slide 1: A valid live update")).toBeVisible();

  await writeFile(carouselFile, valid.replace("align: left", "align: diagonal"));
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("carousels/welcome/carousel.yaml:$.slides[0].options.align");
  await expect(alert).toContainText('received: "diagonal"');
  await expect(alert).toContainText("allowed: left, center");
  await expect(alert).toContainText("last valid preview");
  await expect(page.getByLabel("Slide 1: A valid live update")).toBeVisible();

  await writeFile(carouselFile, original);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("rejects unexpected Host and Origin values", async ({ playwright }) => {
  const badHost = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:4173",
    extraHTTPHeaders: { Host: "evil.example" }
  });
  expect((await badHost.get("/api/state")).status()).toBe(403);
  await badHost.dispose();

  const badOrigin = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:4173",
    extraHTTPHeaders: { Origin: "https://evil.example" }
  });
  expect((await badOrigin.get("/api/state")).status()).toBe(403);
  await badOrigin.dispose();
});

test("rejects Vite filesystem requests outside the web application", async ({ request }) => {
  const repositoryFile = resolve("package.json");
  const response = await request.get(`/@fs/${repositoryFile}`);
  expect(response.status()).toBeGreaterThanOrEqual(400);
  await expect(response.text()).resolves.not.toContain('"name": "slip"');
});
