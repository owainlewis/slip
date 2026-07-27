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
  expectedImage: [number, number, number]
): Promise<{ pixels: Buffer; channels: number }> {
  const svg = await renderSlideSvg(slide, { carouselFile, workspace });
  const decoded = await raster(svg);
  expect(pixel(decoded, ...imagePoint)).toEqual(expectedImage);
  expect(pixel(decoded, ...textPoint)).toEqual([245, 240, 231]);
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
  it("scopes generated SVG resource IDs to each slide", async () => {
    const first = await renderSlideSvg({
      id: "first",
      layout: "type_only",
      content: { headline: "First" },
      options: { align: "left" }
    });
    const second = await renderSlideSvg({
      id: "second",
      layout: "type_only",
      content: { headline: "Second" },
      options: { align: "left" }
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
      image: { src: "../../assets/landscape.svg", position: [0.5, 0.5], zoom: 1 }
    }, { carouselFile, workspace, slideIndex: 0 })).resolves.toContain("<svg");

    await expect(renderSlideSvg({
      id: "headline-overflow",
      layout: "photo_band",
      content: { headline: "W".repeat(80), caption: "W".repeat(120) },
      image: { src: "../../assets/landscape.svg", position: [0.5, 0.5], zoom: 1 }
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
      options: { align: "left" }
    }));
    const maximum = await raster(await renderSlideSvg({
      id: "maximum",
      layout: "type_only",
      content: {
        eyebrow: "e".repeat(40),
        headline: "h".repeat(100),
        body: "b".repeat(260)
      },
      options: { align: "center" }
    }));
    expect(pixel(minimum, 0, 0)).toEqual([245, 240, 231]);
    expect(pixel(maximum, 1079, 1349)).toEqual([245, 240, 231]);
    expect(minimum.pixels.equals(maximum.pixels)).toBe(false);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"ebc9b9320cb1d8196d6db5fe2e53aaf2a8166e19e39e6b900c75f87f9ac0d132"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"015edb11a43703b12e0faf6d3233af6f5bafcaeff4eeaf0a5bac3543b49e20a6"`);
  });

  it("keeps photo_split copy on an opaque 50/50 region for both sides and copy limits", async () => {
    const minimum = await expectOpaqueGeometry({
      id: "minimum",
      layout: "photo_split",
      content: { headline: "x" },
      image: { src: "../../assets/portrait.svg", position: [0, 0], zoom: 3 },
      options: { side: "left" }
    }, [100, 100], [900, 100], [179, 59, 46]);

    const maximum = await expectOpaqueGeometry({
      id: "maximum",
      layout: "photo_split",
      content: {
        headline: "A complete photographic argument stays readable at the longest valid headline".padEnd(80, "x"),
        body: "Judgment and context remain harder to reproduce. The fixed composition gives long supporting copy enough room without shrinking the type, truncating a sentence, or placing any text directly over the photograph.".padEnd(220, "x")
      },
      image: { src: "../../assets/portrait.svg", position: [1, 1], zoom: 3 },
      options: { side: "right" }
    }, [900, 100], [100, 100], [36, 75, 112]);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"86ad6a5ad1db9b2ae054bf14d11c6d456a567803dc5f4d36da8629f75f936f27"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"c8bcff5e982d84db5495bea87419cccbd963796bc1440bab85c4a6a4422ce930"`);
  });

  it("keeps photo_band copy on an opaque lower 38% region at copy and focal limits", async () => {
    const minimum = await expectOpaqueGeometry({
      id: "minimum",
      layout: "photo_band",
      content: { headline: "x" },
      image: { src: "../../assets/landscape.svg", position: [0, 0], zoom: 1 }
    }, [100, 100], [100, 900], [194, 139, 44]);

    const maximum = await expectOpaqueGeometry({
      id: "maximum",
      layout: "photo_band",
      content: {
        headline: "i".repeat(80),
        caption: "Normalized focal coordinates keep the subject deliberate while deterministic clamping prevents the requested crop leaving the image.".padEnd(120, "x").slice(0, 120)
      },
      image: { src: "../../assets/landscape.svg", position: [1, 1], zoom: 3 }
    }, [900, 100], [100, 900], [49, 95, 69]);
    expect(pixelHash(minimum)).toMatchInlineSnapshot(`"2f7d19e510341eb361adef940536d20a8ebee04c9fe6439a7197343ebd6d9531"`);
    expect(pixelHash(maximum)).toMatchInlineSnapshot(`"473beb758f485e171641fd6498d86da9f1fe1a53fa7c0cca84784c753efcbcae"`);
  });
});
