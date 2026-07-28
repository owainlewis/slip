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
    expect(pixelHash(await raster(first))).toMatchInlineSnapshot(`"08c500b3b5ce8fbe833ecbf4589da0b6dcb22fec2c3f152359c53686a593e5fa"`);
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
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"dabc4794bd273293a176e67a97eb6ee452cb2fa628a4ce6275e922a024d6ec9d"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"3c5154e3bb241f5d796501ec460565979c6764329905077f7b2f9a6aa047e7a1"`);
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
      [27, 56, 84],
      [27, 56, 84]
    );
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"427b211afc694ac8c599d0e37dd5845e80fdd35804c40cc545f3aa77d29b5c37"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"37afdbb8ab9de4835d776ac57c70f54b71a1b5c473bdd7c1291f41b24430a5fe"`);
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
    }, [900, 100], [950, 1150], [33, 65, 47], [33, 65, 47]);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"1807be4d8162ab4ae16ea761af6651c93477b61ee4dcdb9a856407300138098b"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"35f9179ae49315d6d40f769354b6eaa04553300c35443390e9c23180df0d0b69"`);
  });
});
