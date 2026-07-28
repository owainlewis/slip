import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { calculateImageCrop, renderSlideImage } from "./image.js";
import { initialiseWorkspace, readCarousel } from "./workspace.js";

const directories: string[] = [];

async function workspace(): Promise<{ root: string; carousel: string }> {
  const root = await mkdtemp(join(tmpdir(), "slip-images-"));
  directories.push(root);
  await initialiseWorkspace(root);
  const carousel = join(root, "carousels", "welcome", "carousel.yaml");
  return { root, carousel };
}

function document(src: string, zoom = 1, layout = "photo_band"): string {
  return `schemaVersion: 1
id: welcome
title: Image validation
slides:
  - id: photo
    layout: ${layout}
    content:
      headline: A photographic slide
    image:
      src: ${src}
      position: [0, 1]
      zoom: ${zoom}
`;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("image framing", () => {
  it("uses cover and clamps requested focal positions to source boundaries", () => {
    const upperLeft = calculateImageCrop(
      { width: 4000, height: 2000 },
      { width: 1080, height: 837 },
      [0, 0],
      1
    );
    expect(upperLeft).toMatchObject({ left: 0, top: 0, height: 2000 });
    expect(upperLeft.width).toBeCloseTo(2580.645);

    const lowerRight = calculateImageCrop(
      { width: 4000, height: 2000 },
      { width: 1080, height: 837 },
      [1, 1],
      2
    );
    expect(lowerRight.left).toBeCloseTo(2709.677);
    expect(lowerRight.top).toBe(1000);
    expect(lowerRight.width).toBeCloseTo(1290.323);
    expect(lowerRight.height).toBe(1000);
  });

  it("keeps schema-v1 540×1350 photo_split sources valid for the flush composition", async () => {
    const { root, carousel } = await workspace();
    const asset = join(root, "assets", "legacy-split.svg");
    await writeFile(
      asset,
      '<svg xmlns="http://www.w3.org/2000/svg" width="540" height="1350"><rect width="540" height="1350" fill="#345"/></svg>'
    );
    await writeFile(carousel, document("../../assets/legacy-split.svg", 1, "photo_split"));

    const parsed = await readCarousel(carousel, root);
    const slide = parsed.slides[0]!;
    expect(slide.layout).toBe("photo_split");
    if (slide.layout !== "photo_split") throw new Error("expected photo_split fixture");

    const dataUri = await renderSlideImage(slide, carousel, root);
    const rendered = await sharp(Buffer.from(dataUri.split(",")[1]!, "base64")).metadata();
    expect(rendered).toMatchObject({ format: "png", width: 540, height: 1350 });

    await writeFile(carousel, document("../../assets/legacy-split.svg", 1.01, "photo_split"));
    await expect(readCarousel(carousel, root)).rejects.toMatchObject({
      yamlPath: "$.slides[0].image.src",
      message: expect.stringContaining("effectively undersized")
    });
  });

  it("accepts a valid local image and reports missing, corrupt, outside, and undersized images", async () => {
    const { root, carousel } = await workspace();
    const asset = join(root, "assets", "large.svg");
    await writeFile(asset, '<svg xmlns="http://www.w3.org/2000/svg" width="5400" height="3600"><rect width="5400" height="3600" fill="#345"/></svg>');
    await writeFile(carousel, document("../../assets/large.svg", 3));
    await expect(readCarousel(carousel, root)).resolves.toMatchObject({ id: "welcome" });

    await writeFile(carousel, document("../../assets/missing.jpg"));
    await expect(readCarousel(carousel, root)).rejects.toMatchObject({
      yamlPath: "$.slides[0].image.src",
      message: expect.stringContaining("image not found")
    });

    await writeFile(join(root, "assets", "corrupt.jpg"), "not an image");
    await writeFile(carousel, document("../../assets/corrupt.jpg"));
    await expect(readCarousel(carousel, root)).rejects.toMatchObject({
      yamlPath: "$.slides[0].image.src",
      message: expect.stringContaining("missing or corrupt")
    });

    const outside = await mkdtemp(join(tmpdir(), "slip-outside-"));
    directories.push(outside);
    await writeFile(join(outside, "outside.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="5400" height="3600"/>');
    await writeFile(carousel, document(relative(dirname(carousel), join(outside, "outside.svg"))));
    await expect(readCarousel(carousel, root)).rejects.toMatchObject({
      yamlPath: "$.slides[0].image.src",
      message: expect.stringContaining("escapes workspace")
    });

    await mkdir(join(root, "assets", "small"), { recursive: true });
    await writeFile(join(root, "assets", "small", "image.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>');
    await writeFile(carousel, document("../../assets/small/image.svg"));
    await expect(readCarousel(carousel, root)).rejects.toMatchObject({
      yamlPath: "$.slides[0].image.src",
      message: expect.stringContaining("effectively undersized")
    });
  });
});
