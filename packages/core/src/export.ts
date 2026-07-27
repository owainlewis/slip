import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { SlipError } from "./errors.js";
import { resolveWithinWorkspace } from "./path.js";
import { renderSlideSvg } from "./renderer.js";
import { assertWorkspace, readCarousel } from "./workspace.js";

export interface InstagramSlide {
  filename: string;
  png: Buffer;
}

export interface InstagramExportResult {
  destination: string;
  files: string[];
}

export interface LinkedInDocument {
  filename: string;
  buffer: Buffer;
  pageCount: number;
}

export interface LinkedInExportResult {
  destination: string;
  pageCount: number;
}

export interface LinkedInExportOptions {
  maximumBytes?: number;
}

export const LINKEDIN_PAGE_WIDTH_POINTS = 576;
export const LINKEDIN_PAGE_HEIGHT_POINTS = 720;
export const LINKEDIN_MAXIMUM_BYTES = 100 * 1024 * 1024;

function instagramFilename(index: number, slideId: string): string {
  return `${String(index + 1).padStart(2, "0")}-${slideId}.png`;
}

async function renderPng(svg: string): Promise<Buffer> {
  const raster = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 }
  }).render().asPng();
  return sharp(raster)
    .toColourspace("srgb")
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

export async function renderInstagramSlides(
  workspacePath: string,
  slug: string
): Promise<InstagramSlide[]> {
  const workspace = await assertWorkspace(workspacePath);
  const carouselFile = await resolveWithinWorkspace(
    workspace,
    "carousels",
    slug,
    "carousel.yaml"
  );
  const carousel = await readCarousel(carouselFile, workspace);
  return Promise.all(
    carousel.slides.map(async (slide, index) => ({
      filename: instagramFilename(index, slide.id),
      png: await renderPng(
        await renderSlideSvg(slide, {
          carouselFile,
          workspace,
          slideIndex: index,
          slideCount: carousel.slides.length
        })
      )
    }))
  );
}

export async function createInstagramZip(
  workspacePath: string,
  slug: string
): Promise<{ filename: string; buffer: Buffer; files: string[] }> {
  const slides = await renderInstagramSlides(workspacePath, slug);
  const zip = new JSZip();
  const stableDate = new Date("2000-01-01T00:00:00.000Z");
  slides.forEach((slide) => {
    zip.file(slide.filename, slide.png, {
      binary: true,
      date: stableDate,
      createFolders: false
    });
  });
  return {
    filename: `${slug}-instagram.zip`,
    buffer: await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      platform: "UNIX"
    }),
    files: slides.map((slide) => slide.filename)
  };
}

function assertLinkedInSize(size: number, maximumBytes: number): void {
  if (size >= maximumBytes) {
    throw new SlipError(
      `LinkedIn PDF is ${size} bytes; it must be smaller than ${maximumBytes} bytes (100 MB platform limit)`
    );
  }
}

export async function createLinkedInPdf(
  workspacePath: string,
  slug: string,
  options: LinkedInExportOptions = {}
): Promise<LinkedInDocument> {
  const slides = await renderInstagramSlides(workspacePath, slug);
  const document = await PDFDocument.create();
  document.setTitle(slug);
  document.setCreator("Slip");
  document.setProducer("Slip");

  for (const slide of slides) {
    const image = await document.embedPng(slide.png);
    const page = document.addPage([
      LINKEDIN_PAGE_WIDTH_POINTS,
      LINKEDIN_PAGE_HEIGHT_POINTS
    ]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: LINKEDIN_PAGE_WIDTH_POINTS,
      height: LINKEDIN_PAGE_HEIGHT_POINTS
    });
  }

  const buffer = Buffer.from(await document.save({
    addDefaultPage: false,
    useObjectStreams: true
  }));
  assertLinkedInSize(
    buffer.byteLength,
    options.maximumBytes ?? LINKEDIN_MAXIMUM_BYTES
  );
  return {
    filename: `${slug}-linkedin.pdf`,
    buffer,
    pageCount: slides.length
  };
}

async function replaceFile(destination: string, content: Buffer): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = join(
    dirname(destination),
    `.slip-${basename(destination)}-${randomUUID()}.tmp`
  );
  try {
    await writeFile(temporary, content, { flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function replaceDirectory(
  destination: string,
  slides: InstagramSlide[]
): Promise<void> {
  const parent = dirname(destination);
  const token = randomUUID();
  const temporary = join(parent, `.slip-${basename(destination)}-${token}.tmp`);
  const backup = join(parent, `.slip-${basename(destination)}-${token}.bak`);
  await mkdir(parent, { recursive: true });
  await mkdir(temporary);
  let movedExisting = false;
  try {
    await Promise.all(
      slides.map((slide) =>
        writeFile(join(temporary, slide.filename), slide.png, { flag: "wx" })
      )
    );
    try {
      await stat(destination);
      await rename(destination, backup);
      movedExisting = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (movedExisting) await rename(backup, destination);
      throw error;
    }
    if (movedExisting) await rm(backup, { recursive: true, force: true });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function canonicalDestination(path: string): Promise<string> {
  let existing = path;
  for (;;) {
    try {
      await lstat(existing);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      existing = parent;
    }
  }
  return resolve(await realpath(existing), relative(existing, path));
}

async function assertSafeExportDestination(
  workspace: string,
  destination: string
): Promise<void> {
  const canonicalWorkspace = await realpath(workspace);
  const canonicalExports = await canonicalDestination(join(canonicalWorkspace, "exports"));
  const canonicalOutput = await canonicalDestination(destination);
  const isWorkspaceOutput = isWithin(canonicalWorkspace, canonicalOutput);
  if (
    (isWorkspaceOutput && !isWithin(canonicalExports, canonicalOutput)) ||
    isWithin(canonicalOutput, canonicalWorkspace)
  ) {
    throw new SlipError(
      `export destination overlaps workspace source files: ${destination}; use ${canonicalExports} or a non-overlapping external path`
    );
  }
}

export async function exportInstagram(
  workspacePath: string,
  slug: string,
  outputPath?: string
): Promise<InstagramExportResult> {
  const workspace = await assertWorkspace(workspacePath);
  const destination = resolve(
    outputPath ?? join(workspace, "exports", `${slug}-instagram`)
  );
  await assertSafeExportDestination(workspace, destination);
  if (extname(destination).toLowerCase() === ".zip") {
    const archive = await createInstagramZip(workspace, slug);
    await replaceFile(destination, archive.buffer);
    return { destination, files: archive.files };
  }
  const slides = await renderInstagramSlides(workspace, slug);
  await replaceDirectory(destination, slides);
  return {
    destination,
    files: slides.map((slide) => slide.filename)
  };
}

export async function exportLinkedIn(
  workspacePath: string,
  slug: string,
  outputPath?: string,
  options: LinkedInExportOptions = {}
): Promise<LinkedInExportResult> {
  const workspace = await assertWorkspace(workspacePath);
  const destination = resolve(
    outputPath ?? join(workspace, "exports", `${slug}-linkedin.pdf`)
  );
  await assertSafeExportDestination(workspace, destination);
  if (extname(destination).toLowerCase() !== ".pdf") {
    throw new SlipError(
      `LinkedIn export destination must end in .pdf: ${destination}`
    );
  }
  const document = await createLinkedInPdf(workspace, slug, options);
  await replaceFile(destination, document.buffer);
  return { destination, pageCount: document.pageCount };
}
