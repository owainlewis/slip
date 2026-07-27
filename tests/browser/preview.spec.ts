import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const carouselFile = resolve(".tmp/playwright-workspace/carousels/essential/carousel.yaml");
const imageFile = resolve(".tmp/playwright-workspace/assets/landscape.svg");

const examples = [
  {
    slug: "boundaries",
    title: "Focal boundaries",
    files: ["01-upper-left.png", "02-lower-right.png"]
  },
  {
    slug: "essential",
    title: "The essential layouts",
    files: ["01-type.png", "02-split.png", "03-band.png"]
  },
  {
    slug: "opposite-sides",
    title: "Opposite sides",
    files: ["01-centered.png", "02-image-right.png"]
  }
];

async function downloadBuffer(page: import("@playwright/test").Page, linkName: string) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: linkName }).click()
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return { filename: download.suggestedFilename(), buffer: Buffer.concat(chunks) };
}

test("lists and previews every polished example at 4:5", async ({ page }) => {
  await page.goto("/");
  const fontsLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      inter: document.fonts.check('400 16px "Inter"'),
      serif: document.fonts.check('700 16px "Source Serif 4"')
    };
  });
  expect(fontsLoaded).toEqual({ inter: true, serif: true });
  for (const example of examples) {
    const card = page.getByRole("link", { name: new RegExp(example.title) });
    await expect(card).toContainText(`${example.files.length} slides`);
    await expect(card).toContainText(/updated/i);
    await card.click();
    await expect(page.getByRole("heading", { name: example.title })).toBeVisible();
    await expect(page.getByTestId("slide")).toHaveCount(example.files.length);
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
    expect(new Set(resourceIds).size).toBe(resourceIds.length);
    await page.getByRole("link", { name: "All carousels" }).click();
  }
});

test("referenced image changes refresh the photographic preview", async ({ page }) => {
  await page.goto("/?carousel=essential");
  const photograph = page.getByTestId("slide").nth(2).locator("svg");
  const before = await photograph.innerHTML();
  const originalImage = await readFile(imageFile, "utf8");
  try {
    await writeFile(
      imageFile,
      '<svg xmlns="http://www.w3.org/2000/svg" width="5400" height="3600"><rect width="5400" height="3600" fill="#a44f38"/></svg>'
    );
    await expect.poll(async () => photograph.innerHTML()).not.toBe(before);
  } finally {
    await writeFile(imageFile, originalImage);
  }
});

test("valid changes refresh and invalid content preserves the last valid preview", async ({ page }) => {
  await page.goto("/?carousel=essential");
  await expect(page.getByLabel("Slide 1: One clear thought")).toBeVisible();
  const original = await readFile(carouselFile, "utf8");
  const valid = original.replace("One clear thought", "A valid live update");
  await writeFile(carouselFile, valid);
  await expect(page.getByLabel("Slide 1: A valid live update")).toBeVisible();

  await writeFile(carouselFile, valid.replace("align: left", "align: diagonal"));
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("carousels/essential/carousel.yaml:$.slides[0].options.align");
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

test("downloads Instagram ZIP and LinkedIn PDF for every example", async ({ page }) => {
  test.setTimeout(40_000);
  for (const example of examples) {
    await page.goto(`/?carousel=${example.slug}`);
    const instagram = await downloadBuffer(page, "Download Instagram PNGs");
    expect(instagram.filename).toBe(`${example.slug}-instagram.zip`);
    const zip = await JSZip.loadAsync(instagram.buffer);
    expect(Object.keys(zip.files)).toEqual(example.files);
    for (const filename of example.files) {
      const png = await zip.file(filename)!.async("nodebuffer");
      expect(await sharp(png).metadata()).toEqual(expect.objectContaining({
        format: "png",
        width: 1080,
        height: 1350,
        space: "srgb"
      }));
    }

    const linkedIn = await downloadBuffer(page, "Download LinkedIn PDF");
    expect(linkedIn.filename).toBe(`${example.slug}-linkedin.pdf`);
    const pdf = await PDFDocument.load(linkedIn.buffer);
    expect(pdf.getPages().map((pdfPage) => pdfPage.getSize())).toEqual(
      example.files.map(() => ({ width: 576, height: 720 }))
    );
  }
});
