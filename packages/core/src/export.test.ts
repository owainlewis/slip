import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  createInstagramZip,
  createLinkedInPdf,
  exportInstagram,
  exportLinkedIn,
  LINKEDIN_PAGE_HEIGHT_POINTS,
  LINKEDIN_PAGE_WIDTH_POINTS,
  renderInstagramSlides
} from "./export.js";
import { initialiseWorkspace } from "./workspace.js";

const directories: string[] = [];
const executeFile = promisify(execFile);

async function workspaceWithTwoSlides(): Promise<{
  parent: string;
  workspace: string;
  carouselFile: string;
}> {
  const parent = await mkdtemp(join(tmpdir(), "slip-export-"));
  directories.push(parent);
  const workspace = join(parent, "workspace");
  await initialiseWorkspace(workspace);
  const carouselFile = join(workspace, "carousels", "welcome", "carousel.yaml");
  await writeFile(
    carouselFile,
    `schemaVersion: 1
id: welcome
title: Export fixture
slides:
  - id: minimum
    layout: type_only
    content:
      headline: x
    options:
      align: left
  - id: centered
    layout: type_only
    content:
      eyebrow: EXPORT
      headline: A second slide
      body: Stable ordering is part of the output contract.
    options:
      align: center
`
  );
  return { parent, workspace, carouselFile };
}

async function pixelHash(png: Buffer): Promise<string> {
  const pixels = await sharp(png).raw().toBuffer();
  return createHash("sha256").update(pixels).digest("hex");
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("Instagram export", () => {
  it("renders stable ordered 1080×1350 sRGB PNG fixtures", async () => {
    const { workspace } = await workspaceWithTwoSlides();
    const slides = await renderInstagramSlides(workspace, "welcome");

    expect(slides.map((slide) => slide.filename)).toEqual([
      "01-minimum.png",
      "02-centered.png"
    ]);
    const metadata = await Promise.all(slides.map((slide) => sharp(slide.png).metadata()));
    expect(metadata).toEqual([
      expect.objectContaining({
        format: "png",
        width: 1080,
        height: 1350,
        space: "srgb"
      }),
      expect.objectContaining({
        format: "png",
        width: 1080,
        height: 1350,
        space: "srgb"
      })
    ]);
    expect(await Promise.all(slides.map((slide) => pixelHash(slide.png)))).toEqual([
      "cbb0ba5cc3f828ffba6c854eda7a40b82802f9b515f34554104a6a19ce82a553",
      "cd5f18044ae0cb5400948cfb8c1adad27e15df15d944b8cff742a2d1268aad29"
    ]);
  });

  it("creates deterministic ZIP and directory outputs from the same PNG entries", async () => {
    const { workspace, carouselFile } = await workspaceWithTwoSlides();
    const sourceBeforeExport = await readFile(carouselFile, "utf8");
    const firstArchive = await createInstagramZip(workspace, "welcome");
    const secondArchive = await createInstagramZip(workspace, "welcome");
    expect(firstArchive.buffer.equals(secondArchive.buffer)).toBe(true);

    const zip = await JSZip.loadAsync(firstArchive.buffer);
    expect(Object.keys(zip.files)).toEqual([
      "01-minimum.png",
      "02-centered.png"
    ]);
    const zipPngs = await Promise.all(
      firstArchive.files.map((filename) => zip.file(filename)!.async("nodebuffer"))
    );

    const destination = join(workspace, "exports", "instagram");
    const result = await exportInstagram(workspace, "welcome", destination);
    expect(result.files).toEqual(firstArchive.files);
    expect(await readdir(destination)).toEqual(firstArchive.files);
    await Promise.all(
      result.files.map(async (filename, index) => {
        expect((await readFile(join(destination, filename))).equals(zipPngs[index]!)).toBe(true);
      })
    );

    const zipDestination = join(workspace, "exports", "instagram.zip");
    await exportInstagram(workspace, "welcome", zipDestination);
    expect((await readFile(zipDestination)).equals(firstArchive.buffer)).toBe(true);
    expect(await readFile(carouselFile, "utf8")).toBe(sourceBeforeExport);
  });

  it("preserves existing output and source files when a later export fails", async () => {
    const { workspace, carouselFile } = await workspaceWithTwoSlides();
    const destination = join(workspace, "exports", "instagram");
    await exportInstagram(workspace, "welcome", destination);
    const originalSource = await readFile(carouselFile, "utf8");
    const originalFiles = await Promise.all(
      (await readdir(destination)).map(async (filename) => ({
        filename,
        content: await readFile(join(destination, filename))
      }))
    );

    await writeFile(carouselFile, originalSource.replace("align: left", "align: diagonal"));
    const invalidSource = await readFile(carouselFile, "utf8");
    await expect(exportInstagram(workspace, "welcome", destination)).rejects.toMatchObject({
      yamlPath: "$.slides[0].options.align"
    });

    expect(await readFile(carouselFile, "utf8")).toBe(invalidSource);
    expect(await readdir(destination)).toEqual(originalFiles.map((file) => file.filename));
    await Promise.all(
      originalFiles.map(async (file) => {
        expect((await readFile(join(destination, file.filename))).equals(file.content)).toBe(true);
      })
    );
    expect((await readdir(join(workspace, "exports"))).some((name) => name.startsWith(".slip-"))).toBe(false);
  });

  it("rejects directory and ZIP destinations that overlap workspace sources", async () => {
    const { parent, workspace, carouselFile } = await workspaceWithTwoSlides();
    const sourceBeforeExport = await readFile(carouselFile, "utf8");
    const sourceDirectory = join(workspace, "carousels", "welcome");
    const sourceZip = join(sourceDirectory, "instagram.zip");

    await expect(
      exportInstagram(workspace, "welcome", sourceDirectory)
    ).rejects.toThrow("export destination overlaps workspace source files");
    await expect(
      exportInstagram(workspace, "welcome", sourceZip)
    ).rejects.toThrow("export destination overlaps workspace source files");
    await expect(
      exportInstagram(workspace, "welcome", parent)
    ).rejects.toThrow("export destination overlaps workspace source files");

    expect(await readFile(carouselFile, "utf8")).toBe(sourceBeforeExport);
    await expect(readFile(sourceZip)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("LinkedIn export", () => {
  it("creates one ordered 576×720 point flattened page from every rendered PNG", async () => {
    const { parent, workspace } = await workspaceWithTwoSlides();
    const slides = await renderInstagramSlides(workspace, "welcome");
    const linkedIn = await createLinkedInPdf(workspace, "welcome");
    const document = await PDFDocument.load(linkedIn.buffer);

    expect(linkedIn.filename).toBe("welcome-linkedin.pdf");
    expect(linkedIn.pageCount).toBe(slides.length);
    expect(document.getPages().map((page) => page.getSize())).toEqual([
      { width: LINKEDIN_PAGE_WIDTH_POINTS, height: LINKEDIN_PAGE_HEIGHT_POINTS },
      { width: LINKEDIN_PAGE_WIDTH_POINTS, height: LINKEDIN_PAGE_HEIGHT_POINTS }
    ]);

    const pdfPath = join(parent, "linkedin.pdf");
    const rasterPrefix = join(parent, "linkedin-page");
    await writeFile(pdfPath, linkedIn.buffer);
    await executeFile("pdftoppm", ["-png", "-r", "135", pdfPath, rasterPrefix]);

    for (const [index, slide] of slides.entries()) {
      const reference = await sharp(slide.png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const raster = await sharp(
        await readFile(`${rasterPrefix}-${index + 1}.png`)
      ).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(raster.info).toEqual(expect.objectContaining({
        width: 1080,
        height: 1350,
        channels: 3
      }));
      expect(raster.data.byteLength).toBe(reference.data.byteLength);

      let maximumChannelDelta = 0;
      let totalChannelDelta = 0;
      let channelsOutsideTolerance = 0;
      for (let channel = 0; channel < reference.data.byteLength; channel += 1) {
        const delta = Math.abs(reference.data[channel]! - raster.data[channel]!);
        maximumChannelDelta = Math.max(maximumChannelDelta, delta);
        totalChannelDelta += delta;
        if (delta > 8) channelsOutsideTolerance += 1;
      }
      expect(maximumChannelDelta).toBeLessThanOrEqual(200);
      expect(totalChannelDelta / reference.data.byteLength).toBeLessThanOrEqual(0.5);
      expect(channelsOutsideTolerance / reference.data.byteLength).toBeLessThanOrEqual(0.02);
    }
  }, 20_000);

  it("writes atomically and preserves existing output when the PDF exceeds the limit", async () => {
    const { workspace } = await workspaceWithTwoSlides();
    const destination = join(workspace, "exports", "welcome-linkedin.pdf");
    await writeFile(destination, "existing PDF");

    await expect(
      exportLinkedIn(workspace, "welcome", destination, { maximumBytes: 1 })
    ).rejects.toThrow("must be smaller than 1 bytes");
    expect(await readFile(destination, "utf8")).toBe("existing PDF");
    expect(
      (await readdir(join(workspace, "exports"))).some((name) => name.startsWith(".slip-"))
    ).toBe(false);
  });

  it("rejects non-PDF and source-overlapping destinations without creating output", async () => {
    const { workspace, carouselFile } = await workspaceWithTwoSlides();
    const sourceBeforeExport = await readFile(carouselFile, "utf8");

    await expect(
      exportLinkedIn(workspace, "welcome", join(workspace, "exports", "linkedin.zip"))
    ).rejects.toThrow("must end in .pdf");
    await expect(
      exportLinkedIn(workspace, "welcome", join(workspace, "carousels", "welcome", "slides.pdf"))
    ).rejects.toThrow("export destination overlaps workspace source files");
    expect(await readFile(carouselFile, "utf8")).toBe(sourceBeforeExport);
  });
});
