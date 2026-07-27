import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { carouselJsonSchema } from "./schema.js";
import { createCarousel, initialiseWorkspace, readCarousel, validateWorkspace } from "./workspace.js";
import { resolveWithinWorkspace } from "./path.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "slip-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("workspace", () => {
  it("initialises the required files with a valid type_only example", async () => {
    const directory = await temporaryDirectory();
    await initialiseWorkspace(directory);

    const example = await readCarousel(join(directory, "carousels", "welcome", "carousel.yaml"));
    expect(example.id).toBe("welcome");
    expect(example.slides[0]?.layout).toBe("type_only");
    expect(JSON.parse(await readFile(join(directory, "schema", "carousel.schema.json"), "utf8"))).toEqual(
      carouselJsonSchema()
    );
    await expect(readFile(join(directory, ".gitignore"), "utf8")).resolves.toContain("exports/");
  });

  it("creates a carousel without replacing an existing file", async () => {
    const directory = await temporaryDirectory();
    await initialiseWorkspace(directory);
    const file = await createCarousel(directory, "demo", "Demo carousel");
    await expect(readCarousel(file)).resolves.toMatchObject({ id: "demo", title: "Demo carousel" });
    await expect(createCarousel(directory, "demo")).rejects.toThrow("already exists");
  });

  it("reports unknown keys with a YAML path", async () => {
    const directory = await temporaryDirectory();
    await initialiseWorkspace(directory);
    const file = join(directory, "carousels", "welcome", "carousel.yaml");
    await writeFile(
      file,
      `schemaVersion: 1
id: welcome
title: Welcome
unexpected: true
slides:
  - id: cover
    layout: type_only
    content:
      headline: Hello
`
    );
    await expect(validateWorkspace(directory)).rejects.toMatchObject({
      file: expect.stringContaining("/carousels/welcome/carousel.yaml"),
      yamlPath: "$",
      message: expect.stringContaining("Unrecognized key")
    });
  });

  it("rejects traversal and symlink escapes", async () => {
    const directory = await temporaryDirectory();
    await initialiseWorkspace(directory);
    const outside = await temporaryDirectory();
    await mkdir(join(directory, "carousels", "linked"));
    await symlink(outside, join(directory, "carousels", "linked", "escape"));

    await expect(resolveWithinWorkspace(directory, "..", "outside")).rejects.toThrow("escapes workspace");
    await expect(resolveWithinWorkspace(directory, "carousels", "linked", "escape", "file")).rejects.toThrow(
      "escapes workspace"
    );
  });
});
