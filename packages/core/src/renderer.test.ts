import { mkdtemp, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Slide } from "./layouts.js";
import { renderSlideSvg } from "./renderer.js";
import { initialiseWorkspace } from "./workspace.js";

let workspace: string;
let carouselFile: string;

async function raster(svg: string): Promise<{ pixels: Buffer; channels: number }> {
  const result = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
  expect(result.info).toMatchObject({ width: 1080, height: 1350 });
  return { pixels: result.data, channels: result.info.channels };
}

function pixel(
  image: { pixels: Buffer; channels: number },
  x: number,
  y: number
): [number, number, number] {
  const offset = (y * 1080 + x) * image.channels;
  return [image.pixels[offset]!, image.pixels[offset + 1]!, image.pixels[offset + 2]!];
}

function pixelHash(image: { pixels: Buffer }): string {
  return createHash("sha256").update(image.pixels).digest("hex");
}

async function expectOpaqueGeometry(
  slide: Slide,
  imagePoint: [number, number],
  textPoint: [number, number],
  expectedImage: [number, number, number],
  expectedText: [number, number, number] = [238, 232, 220]
): Promise<{ pixels: Buffer; channels: number }> {
  const svg = await renderSlideSvg(slide, { carouselFile, workspace });
  const decoded = await raster(svg);
  expect(pixel(decoded, ...imagePoint)).toEqual(expectedImage);
  expect(pixel(decoded, ...textPoint)).toEqual(expectedText);
  return decoded;
}

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "slip-renderer-"));
  await initialiseWorkspace(workspace);
  carouselFile = join(workspace, "carousels", "welcome", "carousel.yaml");
  await writeFile(
    join(workspace, "assets", "portrait.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="5400">
      <rect width="2400" height="2700" fill="#b33b2e"/>
      <rect y="2700" width="2400" height="2700" fill="#244b70"/>
    </svg>`
  );
  await writeFile(
    join(workspace, "assets", "landscape.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="5400" height="3600">
      <rect width="2700" height="3600" fill="#c28b2c"/>
      <rect x="2700" width="2700" height="3600" fill="#315f45"/>
    </svg>`
  );
});

afterAll(async () => {
  const { rm } = await import("node:fs/promises");
  await rm(workspace, { recursive: true, force: true });
});

describe("layout pixel regression", () => {
  it("preserves authored headline lines, emphasis, folios, and deterministic texture", async () => {
    const slide: Slide = {
      id: "authored",
      layout: "type_only",
      content: {
        headline: "Look long\nenough to see.",
        emphasis: "see"
      },
      options: { align: "left", tone: "ink", emphasisStyle: "mark" }
    };
    const context = { carouselFile, workspace, slideIndex: 1, slideCount: 3 };
    const first = await renderSlideSvg(slide, context);
    const second = await renderSlideSvg(slide, context);
    expect(first).toBe(second);
    expect(first).toContain('data-headline-lines="2"');
    expect(first).toContain('data-emphasis-style="mark"');
    expect(first).toContain('data-folio-value="02 / 03"');
    expect(pixelHash(await raster(first))).toMatchInlineSnapshot(`"62f939c884bd7712ef294d0d8d1b4998bcf021ef5811d8c12da6e4fddfdde25c"`);
  });

  it("scopes generated SVG resource IDs to each slide", async () => {
    const first = await renderSlideSvg({
      id: "first",
      layout: "type_only",
      content: { headline: "First" },
      options: { align: "left", tone: "paper", emphasisStyle: "italic" }
    });
    const second = await renderSlideSvg({
      id: "second",
      layout: "type_only",
      content: { headline: "Second" },
      options: { align: "left", tone: "paper", emphasisStyle: "italic" }
    });
    const firstIds = [...first.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!);
    const secondIds = [...second.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!);
    expect(firstIds.length).toBeGreaterThan(0);
    expect(firstIds.every((id) => id.startsWith("slip-first-"))).toBe(true);
    expect(secondIds.every((id) => id.startsWith("slip-second-"))).toBe(true);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  it("wraps long tokens and reports field-specific overflow before returning a clipped slide", async () => {
    await expect(renderSlideSvg({
      id: "caption-wrap",
      layout: "photo_band",
      content: { headline: "A short headline", caption: "W".repeat(120) },
      image: { src: "../../assets/landscape.svg", position: [0.5, 0.5], zoom: 1 },
      options: { tone: "paper", emphasisStyle: "italic" }
    }, { carouselFile, workspace, slideIndex: 0 })).resolves.toContain("<svg");

    await expect(renderSlideSvg({
      id: "headline-overflow",
      layout: "photo_band",
      content: { headline: "W".repeat(80), caption: "W".repeat(120) },
      image: { src: "../../assets/landscape.svg", position: [0.5, 0.5], zoom: 1 },
      options: { tone: "paper", emphasisStyle: "italic" }
    }, { carouselFile, workspace, slideIndex: 1 })).rejects.toMatchObject({
      file: carouselFile,
      yamlPath: "$.slides[1].content.headline",
      message: "text overflow in content.headline"
    });
  });

  it("renders minimum and maximum type_only content at 1080×1350", async () => {
    const minimum = await raster(await renderSlideSvg({
      id: "minimum",
      layout: "type_only",
      content: { headline: "x" },
      options: { align: "left", tone: "paper", emphasisStyle: "italic" }
    }));
    const maximum = await raster(await renderSlideSvg({
      id: "maximum",
      layout: "type_only",
      content: {
        eyebrow: "e".repeat(40),
        headline: "h".repeat(100),
        body: "b".repeat(260)
      },
      options: { align: "center", tone: "ink", emphasisStyle: "mark" }
    }));
    expect(pixel(minimum, 0, 0)).toEqual([238, 232, 220]);
    expect(pixel(maximum, 1079, 1349)).toEqual([32, 35, 31]);
    expect(minimum.pixels.equals(maximum.pixels)).toBe(false);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"4ada3077f0be1bc6d50c89e3374d562353d18a5bcc369ff74b62dfdd60706c6a"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"4fe3d078c398651083a2edbdc374da372dc5a332daccd4f9e119bfc38f010d1e"`);
  });

  it("keeps photo_split copy on an asymmetric opaque region for both sides and copy limits", async () => {
    const minimum = await expectOpaqueGeometry({
      id: "minimum",
      layout: "photo_split",
      content: { headline: "x" },
      image: { src: "../../assets/portrait.svg", position: [0, 0], zoom: 3 },
      options: { side: "left", tone: "paper", emphasisStyle: "italic" }
    }, [100, 100], [900, 100], [179, 59, 46]);

    const maximum = await expectOpaqueGeometry({
      id: "maximum",
      layout: "photo_split",
      content: {
        headline: "A complete photographic argument stays readable at the longest valid headline".padEnd(80, "x"),
        body: "Judgment and context remain harder to reproduce. The fixed composition gives long supporting copy enough room without shrinking the type, truncating a sentence, or placing any text directly over the photograph.".padEnd(220, "x")
      },
      image: { src: "../../assets/portrait.svg", position: [1, 1], zoom: 3 },
      options: { side: "right", tone: "ink", emphasisStyle: "mark" }
    }, [900, 100], [100, 100], [36, 75, 112], [32, 35, 31]);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"65ae3f1c1cc8063603fec3ca3b5e50e9083036b437658172e5a01ca296d0b837"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"da390b119aeabf5d35f7cc49f51be603ec06d1d4d7fd465781ab51d909c3b82e"`);
  });

  it("composes photo_band with an inset opaque surface at copy and focal limits", async () => {
    const minimum = await expectOpaqueGeometry({
      id: "minimum",
      layout: "photo_band",
      content: { headline: "x" },
      image: { src: "../../assets/landscape.svg", position: [0, 0], zoom: 1 },
      options: { tone: "paper", emphasisStyle: "italic" }
    }, [100, 100], [950, 1150], [194, 139, 44], [238, 232, 220]);

    const maximum = await expectOpaqueGeometry({
      id: "maximum",
      layout: "photo_band",
      content: {
        headline: "i".repeat(80),
        caption: "Normalized focal coordinates keep the subject deliberate while deterministic clamping prevents the requested crop leaving the image.".padEnd(120, "x").slice(0, 120)
      },
      image: { src: "../../assets/landscape.svg", position: [1, 1], zoom: 3 },
      options: { tone: "ink", emphasisStyle: "mark" }
    }, [900, 100], [950, 1150], [49, 95, 69], [32, 35, 31]);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"65ac0627ff4bf0e5a776e133d344f03f5ee157374c66732ede9bccdf7e5c7f09"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"fb648d1e36201f0437af356639b08bea4f95430df2785d903d11b6f8b44aa732"`);
  });
});
