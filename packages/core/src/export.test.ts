import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  createInstagramZip,
  exportInstagram,
  renderInstagramSlides
} from "./export.js";
import { initialiseWorkspace } from "./workspace.js";

const directories: string[] = [];

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
      "19fcbaf0840a19e21613e2e99657b8fd212c99cdaa83d5417d25bd15fed5ccae",
      "14ddffd81c82ced56e6450d0244ea033ad3bdc16a01266517b9218771c0541a2"
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
