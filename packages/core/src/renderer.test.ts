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

async function expectFullBleedGeometry(
  slide: Slide,
  firstPoint: [number, number],
  secondPoint: [number, number],
  expectedFirst: [number, number, number],
  expectedSecond: [number, number, number]
): Promise<{ pixels: Buffer; channels: number }> {
  const svg = await renderSlideSvg(slide, {
    carouselFile,
    workspace,
    slideIndex: 0,
    slideCount: 2
  });
  const decoded = await raster(svg);
  expect(pixel(decoded, ...firstPoint)).toEqual(expectedFirst);
  expect(pixel(decoded, ...secondPoint)).toEqual(expectedSecond);
  return decoded;
}

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "slip-renderer-"));
  await initialiseWorkspace(workspace);
  carouselFile = join(workspace, "carousels", "welcome", "carousel.yaml");
  await writeFile(
    join(workspace, "assets", "portrait.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="8100">
      <rect width="3600" height="4050" fill="#b33b2e"/>
      <rect y="4050" width="3600" height="4050" fill="#244b70"/>
    </svg>`
  );
  await writeFile(
    join(workspace, "assets", "landscape.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="6750" height="4500">
      <rect width="3375" height="4500" fill="#c28b2c"/>
      <rect x="3375" width="3375" height="4500" fill="#315f45"/>
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
    expect(first).toContain('data-text-shaping="fontkit"');
    expect(first).toContain('data-emphasis-style="mark"');
    expect(first).toContain('data-folio-value="02 / 03"');
    expect(pixelHash(await raster(first))).toMatchInlineSnapshot(`"a126d3ecc7db6c0c78797cc7db55e836e8be7a99ace91a883bbc6c0a94a8ca43"`);
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

  it("keeps emphasis aligned when astral characters precede it", async () => {
    const svg = await renderSlideSvg({
      id: "unicode-emphasis",
      layout: "type_only",
      content: {
        headline: "👋 Context",
        emphasis: "Context"
      },
      options: { align: "center", tone: "paper", emphasisStyle: "italic" }
    });
    expect(pixelHash(await raster(svg))).toMatchInlineSnapshot(`"20626ccab3dfa7478151d2198d08ef3962193728a8678ff859d89d9d170b5aa3"`);
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
      id: "caption-overflow",
      layout: "photo_band",
      content: { headline: "A short headline", caption: "W".repeat(1000) },
      image: { src: "../../assets/landscape.svg", position: [0.5, 0.5], zoom: 1 },
      options: { tone: "paper", emphasisStyle: "italic" }
    }, { carouselFile, workspace, slideIndex: 1 })).rejects.toMatchObject({
      file: carouselFile,
      yamlPath: "$.slides[1].content.caption",
      message: "text overflow in content.caption"
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
    expect(pixel(minimum, 0, 0)).toEqual([242, 240, 234]);
    expect(pixel(maximum, 1079, 1349)).toEqual([13, 13, 12]);
    expect(minimum.pixels.equals(maximum.pixels)).toBe(false);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"460a072ea2cf7899a4d5992a30b999a33ea94fef3cd8eb5ec4cf0e07a62eba94"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"e65f04a78923184fd9169683babc0722f59bce69e4f5385c33274e9f96e66eea"`);
  });

  it("composes photo_split as full-bleed editorial photography for both sides and copy limits", async () => {
    const minimumSlide: Slide = {
      id: "minimum",
      layout: "photo_split",
      content: { headline: "x" },
      image: { src: "../../assets/portrait.svg", position: [0, 0], zoom: 3 },
      options: { side: "left", tone: "paper", emphasisStyle: "italic" }
    };
    expect(await renderSlideSvg(minimumSlide, { carouselFile, workspace }))
      .toContain('data-headline-align="right"');
    const minimum = await expectFullBleedGeometry(
      minimumSlide,
      [100, 100],
      [900, 100],
      [228, 200, 193],
      [228, 200, 193]
    );

    const maximumSlide: Slide = {
      id: "maximum",
      layout: "photo_split",
      content: {
        headline: "A complete photographic argument stays readable at the longest valid headline".padEnd(80, "x"),
        body: "Judgment and context remain harder to reproduce. The fixed composition gives long supporting copy enough room without shrinking the type, truncating a sentence, or placing any text directly over the photograph.".padEnd(220, "x")
      },
      image: { src: "../../assets/portrait.svg", position: [1, 1], zoom: 3 },
      options: { side: "right", tone: "ink", emphasisStyle: "mark" }
    };
    expect(await renderSlideSvg(maximumSlide, { carouselFile, workspace }))
      .toContain('data-headline-align="left"');
    const maximum = await expectFullBleedGeometry(
      maximumSlide,
      [900, 100],
      [100, 100],
      [26, 54, 81],
      [26, 54, 81]
    );
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"9c3e993cd9823bfe787e80b4d17fff525e1776f4d7de61da23d964d198be4c3c"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"ada63c12303189a91a54be19a60e5171d8cf089b3f5cb94213808e1ec78315df"`);
  });

  it("composes photo_band as centered full-bleed photography at copy and focal limits", async () => {
    const minimum = await expectFullBleedGeometry({
      id: "minimum",
      layout: "photo_band",
      content: { headline: "x" },
      image: { src: "../../assets/landscape.svg", position: [0, 0], zoom: 1 },
      options: { tone: "paper", emphasisStyle: "italic" }
    }, [100, 100], [950, 1150], [232, 218, 193], [232, 218, 193]);

    const maximum = await expectFullBleedGeometry({
      id: "maximum",
      layout: "photo_band",
      content: {
        headline: "i".repeat(80),
        caption: "Normalized focal coordinates keep the subject deliberate while deterministic clamping prevents the requested crop leaving the image.".padEnd(120, "x").slice(0, 120)
      },
      image: { src: "../../assets/landscape.svg", position: [1, 1], zoom: 3 },
      options: { tone: "ink", emphasisStyle: "mark" }
    }, [900, 100], [950, 1150], [35, 69, 50], [18, 36, 26]);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"636a407248a6e118352a01c88ae3569697c6dff3ac3f38edc89323585d5f7079"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"899bd4640c5fb2f3a55cbbac2d7bcedaa86ad207246c00e4e53a77015e005383"`);
  });
});
