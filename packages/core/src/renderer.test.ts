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
  const svg = await renderSlideSvg(slide, { carouselFile, workspace });
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
    expect(pixelHash(await raster(first))).toMatchInlineSnapshot(`"8843e6a39053ba24fc2c9455707bb2fd6a78f9420f562ca905bdf7f21083e3a2"`);
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
    expect(pixelHash(await raster(svg))).toMatchInlineSnapshot(`"a897462ec938dfacdcd456cbaa4cbb184fbee0dac78c6adc06aceef26e79baa3"`);
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
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"23fdf0b5a6714c1f7afc838184eb8dd78f47ecbd5fb7eb4279a7509232f2af79"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"848de4c820faefb38d69ec1755d91ff1ee70ab3c69a5800482088e4b18c1bec6"`);
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
      [14, 30, 45],
      [14, 30, 45]
    );
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"b02342147c4813205aeaa2d549931a460ed42efc84a7e128df08796b67bee37e"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"447ab232b1ca9f584c8cb55ffc753635d999dfa5fe44426d28c1a2bea2807e0c"`);
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
    }, [900, 100], [950, 1150], [20, 38, 28], [20, 38, 28]);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"d5935f9d344009986a315b96a7d08265cdc93a3b14224a1d3c1e78e66ed9cbc9"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"e12adc22a11f2268c1466f603fe554c8489e9ebd363bddccef32178068a2eeba"`);
  });
});
