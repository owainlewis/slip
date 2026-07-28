import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import sharp from "sharp";
import { SlipError } from "./errors.js";
import type { PhotoSlide } from "./layouts.js";
import type { Carousel } from "./schema.js";
import { resolveWithinWorkspace } from "./path.js";

export interface ImageRegion {
  width: number;
  height: number;
}

export interface ImageCrop {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const imageRegions = {
  photo_split: { width: 1080, height: 1350 },
  photo_band: { width: 1080, height: 1350 }
} as const satisfies Record<PhotoSlide["layout"], ImageRegion>;

const imageValidationRegions = {
  photo_split: { width: 540, height: 1350 },
  photo_band: { width: 1080, height: 820 }
} as const satisfies Record<PhotoSlide["layout"], ImageRegion>;

export function calculateImageCrop(
  source: ImageRegion,
  destination: ImageRegion,
  position: [number, number],
  zoom: number
): ImageCrop {
  const coverScale = Math.max(destination.width / source.width, destination.height / source.height);
  const scale = coverScale * zoom;
  const width = destination.width / scale;
  const height = destination.height / scale;
  const left = Math.min(Math.max(position[0] * source.width - width / 2, 0), source.width - width);
  const top = Math.min(Math.max(position[1] * source.height - height / 2, 0), source.height - height);
  return { left, top, width, height };
}

function assertSufficientPixels(
  source: ImageRegion,
  region: ImageRegion,
  crop: ImageCrop,
  carouselFile: string,
  yamlPath?: string
): void {
  if (crop.width >= region.width && crop.height >= region.height) return;
  throw new SlipError(
    `image is effectively undersized after cover and zoom: ${source.width}×${source.height} source provides ${Math.floor(crop.width)}×${Math.floor(crop.height)} pixels for a ${region.width}×${region.height} region`,
    carouselFile,
    yamlPath
  );
}

function assertSlideImageSufficient(
  source: ImageRegion,
  slide: PhotoSlide,
  carouselFile: string,
  yamlPath?: string
): void {
  const region = imageValidationRegions[slide.layout];
  const crop = calculateImageCrop(source, region, slide.image.position, slide.image.zoom);
  assertSufficientPixels(source, region, crop, carouselFile, yamlPath);
}

async function resolveImagePath(
  workspace: string,
  carouselFile: string,
  slide: PhotoSlide,
  slideIndex?: number
): Promise<string> {
  const yamlPath = slideIndex === undefined ? undefined : `$.slides[${slideIndex}].image.src`;
  try {
    const candidate = resolve(dirname(carouselFile), slide.image.src);
    return await resolveWithinWorkspace(workspace, relative(workspace, candidate));
  } catch (error) {
    throw new SlipError((error as Error).message, carouselFile, yamlPath);
  }
}

async function imageMetadata(
  path: string,
  carouselFile: string,
  yamlPath?: string
): Promise<{ width: number; height: number; buffer: Buffer }> {
  try {
    const buffer = await readFile(path);
    const metadata = await sharp(buffer, { failOn: "error" }).metadata();
    if (!metadata.width || !metadata.height) throw new Error("image has no intrinsic dimensions");
    return { width: metadata.width, height: metadata.height, buffer };
  } catch (error) {
    const message = (error as NodeJS.ErrnoException).code === "ENOENT"
      ? `image not found: ${path}`
      : `image is missing or corrupt: ${path}; ${(error as Error).message}`;
    throw new SlipError(message, carouselFile, yamlPath);
  }
}

export async function validateCarouselImages(
  carousel: Carousel,
  carouselFile: string,
  workspace: string
): Promise<void> {
  for (const [index, slide] of carousel.slides.entries()) {
    if (slide.layout === "type_only") continue;
    const yamlPath = `$.slides[${index}].image.src`;
    const path = await resolveImagePath(workspace, carouselFile, slide, index);
    const source = await imageMetadata(path, carouselFile, yamlPath);
    assertSlideImageSufficient(source, slide, carouselFile, yamlPath);
  }
}

export async function renderSlideImage(
  slide: PhotoSlide,
  carouselFile: string,
  workspace: string
): Promise<string> {
  const path = await resolveImagePath(workspace, carouselFile, slide);
  const source = await imageMetadata(path, carouselFile);
  assertSlideImageSufficient(source, slide, carouselFile);
  const region = imageRegions[slide.layout];
  const crop = calculateImageCrop(source, region, slide.image.position, slide.image.zoom);
  const width = Math.min(source.width, Math.max(1, Math.round(crop.width)));
  const height = Math.min(source.height, Math.max(1, Math.round(crop.height)));
  const buffer = await sharp(source.buffer)
    .extract({
      left: Math.min(source.width - width, Math.max(0, Math.round(crop.left))),
      top: Math.min(source.height - height, Math.max(0, Math.round(crop.top))),
      width,
      height
    })
    .resize(region.width, region.height, { fit: "fill" })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
