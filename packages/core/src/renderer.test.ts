import { mkdtemp, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Slide } from "./layouts.js";
import { fitHeadlineSize, measureHeadlineLine, renderSlideSvg } from "./renderer.js";
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
  expectedText: [number, number, number] = [239, 237, 232]
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
    expect(pixelHash(await raster(first))).toMatchInlineSnapshot(`"c67af2a4b8f82f50659e3b76241bf31d75c4d8705b7b9e8b5bd0b3d7a6c74d3c"`);
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

  it("absorbs the longest schema-permitted copy on every layout instead of overflowing", async () => {
    // Headlines are auto-fitted, so copy within the schema's length caps always
    // lands inside the frame. The overflow guard in renderSlideSvg is retained as
    // defence for future layout changes, but no schema-valid content reaches it.
    const image = { src: "../../assets/landscape.svg", position: [0.5, 0.5] as [number, number], zoom: 1 };
    const worst: Slide[] = [
      {
        id: "type-only-max",
        layout: "type_only",
        content: { eyebrow: "e".repeat(40), headline: "W".repeat(100), body: "W".repeat(260) },
        options: { align: "center", tone: "ink", emphasisStyle: "mark" }
      },
      {
        id: "photo-full-max",
        layout: "photo_full",
        content: { headline: "W".repeat(100), body: "W".repeat(180) },
        image,
        options: { emphasisStyle: "italic" }
      },
      {
        id: "photo-split-max",
        layout: "photo_split",
        content: { headline: "W".repeat(80), body: "W".repeat(220) },
        image,
        options: { side: "left", tone: "paper", emphasisStyle: "italic" }
      },
      {
        id: "photo-band-max",
        layout: "photo_band",
        content: { headline: "W".repeat(80), caption: "W".repeat(120) },
        image,
        options: { tone: "paper", emphasisStyle: "italic" }
      }
    ];

    for (const [index, slide] of worst.entries()) {
      await expect(
        renderSlideSvg(slide, { carouselFile, workspace, slideIndex: index, slideCount: worst.length })
      ).resolves.toContain("<svg");
    }
  });

  it("holds the authored rag and only wraps when doing so would go below the minimum size", () => {
    const box = { width: 900, height: 800 };
    const bounds = { min: 40, max: 140 };

    // Three authored lines of equal length: width-bound, and no line re-wraps.
    const held = fitHeadlineSize(
      ["Better tools widen", "the field. They don't", "hand you a point of view"],
      box,
      0.9,
      bounds
    );
    expect(held).toBeGreaterThanOrEqual(bounds.min);
    expect(held).toBeLessThanOrEqual(bounds.max);
    expect(held % 2).toBe(0);
    expect(measureHeadlineLine("hand you a point of view") * held).toBeLessThanOrEqual(box.width);

    // Short copy is capped by `max`, not stretched past it.
    expect(fitHeadlineSize(["Yes"], box, 0.9, bounds)).toBe(bounds.max);

    // Many lines become height-bound rather than width-bound.
    const tall = fitHeadlineSize(Array.from({ length: 12 }, () => "a line"), box, 0.9, bounds);
    expect(tall * 12 * 0.9).toBeLessThanOrEqual(box.height);

    // Copy too long to hold at the minimum size falls back to wrapping.
    expect(fitHeadlineSize(["W".repeat(100)], box, 0.9, bounds)).toBe(bounds.min);
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
    expect(pixel(minimum, 0, 0)).toEqual([239, 237, 232]);
    expect(pixel(maximum, 1079, 1349)).toEqual([12, 12, 11]);
    expect(minimum.pixels.equals(maximum.pixels)).toBe(false);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"d946b2ed680f269e1cb3a0b2dd37787831fdb7c4e904726a715b86f900088afd"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"017e76b5f7c0a6f1085e23816c6371b57234ae1d004e2441051724489022fa0e"`);
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
    }, [900, 100], [100, 100], [36, 75, 112], [12, 12, 11]);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"c4ac507f50107412f5e312d1b2d9a354244e0c4c4169552ee8e5eb9ef2cec999"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"ac585c7c513e712bde8e81244b43aeedae7e378e8c02ee8c439fe64c6a358b56"`);
  });

  it("composes photo_band with an inset opaque surface at copy and focal limits", async () => {
    const minimum = await expectOpaqueGeometry({
      id: "minimum",
      layout: "photo_band",
      content: { headline: "x" },
      image: { src: "../../assets/landscape.svg", position: [0, 0], zoom: 1 },
      options: { tone: "paper", emphasisStyle: "italic" }
    }, [100, 100], [950, 1150], [194, 139, 44], [239, 237, 232]);

    const maximum = await expectOpaqueGeometry({
      id: "maximum",
      layout: "photo_band",
      content: {
        headline: "i".repeat(80),
        caption: "Normalized focal coordinates keep the subject deliberate while deterministic clamping prevents the requested crop leaving the image.".padEnd(120, "x").slice(0, 120)
      },
      image: { src: "../../assets/landscape.svg", position: [1, 1], zoom: 3 },
      options: { tone: "ink", emphasisStyle: "mark" }
    }, [900, 100], [950, 1150], [49, 95, 69], [12, 12, 11]);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"6a2b804e5c38129724e3bc455fee6782e366c251e854c69120eeab23ba187a0f"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"b99f2c5df84ec0c1c5b5e44d24fac2dad5e3b3379b2f93c23edbd169cd833838"`);
  });
});
