import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

const cli = resolve("apps/cli/src/index.ts");
const tsx = resolve("node_modules/.bin/tsx");
const directories: string[] = [];

async function run(args: string[], cwd: string) {
  return execa(tsx, [cli, ...args], { cwd, reject: false });
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("CLI contracts", () => {
  it("lists and documents every registered layout", async () => {
    const list = await run(["layouts"], process.cwd());
    expect(list.exitCode).toBe(0);
    expect(list.stdout).toContain("type_only");
    expect(list.stdout).toContain("photo_split");
    expect(list.stdout).toContain("photo_band");

    const detail = await run(["layouts", "photo_split"], process.cwd());
    expect(detail.exitCode).toBe(0);
    expect(detail.stdout).toContain("content.headline  required, 1–80 characters");
    expect(detail.stdout).toContain("image.position    [x, y], each 0–1 inclusive");
    expect(detail.stdout).toContain("image.zoom        1–3 (default: 1)");
    expect(detail.stdout).toContain("options.side      left | right (default: left)");
    expect(detail.stdout).toContain("layout: photo_split");

    const unknown = await run(["layouts", "hero"], process.cwd());
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stderr).toContain('unknown layout "hero"');
    expect(unknown.stderr).toContain("type_only, photo_split, photo_band");
  });

  it("supports init, new, and validate with actionable locations", async () => {
    const parent = await mkdtemp(join(tmpdir(), "slip-cli-"));
    directories.push(parent);
    const workspace = join(parent, "workspace");

    const init = await run(["init", workspace], process.cwd());
    expect(init.exitCode).toBe(0);
    expect(init.stdout).toContain("Created Slip workspace");

    const created = await run(["new", "demo", "--title", "Demo carousel"], workspace);
    expect(created.exitCode).toBe(0);
    expect(await readFile(join(workspace, "carousels", "demo", "carousel.yaml"), "utf8")).toContain(
      "title: Demo carousel"
    );

    const valid = await run(["validate", "demo"], workspace);
    expect(valid.exitCode).toBe(0);
    expect(valid.stdout).toBe("valid carousels/demo/carousel.yaml");

    await writeFile(
      join(workspace, "carousels", "demo", "carousel.yaml"),
      "schemaVersion: 1\nid: demo\ntitle: Demo\nslides:\n  - id: cover\n    layout: type_only\n    content:\n      headline: ok\n    options:\n      align: diagonal\n"
    );
    const invalid = await run(["validate", "demo"], workspace);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain("carousels/demo/carousel.yaml:$.slides[0].options.align");
    expect(invalid.stderr).toContain('received: "diagonal"');
    expect(invalid.stderr).toContain("allowed: left, center");

    const invalidNew = await run(["new", "too-long", "--title", "x".repeat(101)], workspace);
    expect(invalidNew.exitCode).toBe(1);
    expect(invalidNew.stderr).toContain("carousels/too-long/carousel.yaml:$.slides[0].content.headline");
    await expect(access(join(workspace, "carousels", "too-long", "carousel.yaml"))).rejects.toThrow();
  }, 15_000);

  it("exports ordered Instagram PNGs to a directory or ZIP", async () => {
    const parent = await mkdtemp(join(tmpdir(), "slip-cli-export-"));
    directories.push(parent);
    const workspace = join(parent, "workspace");
    await run(["init", workspace], process.cwd());

    const destination = join(parent, "instagram");
    const exported = await run(
      ["export", "welcome", "--platform", "instagram", "--output", destination],
      workspace
    );
    expect(exported.exitCode).toBe(0);
    expect(exported.stdout).toContain(`Exported 1 Instagram PNG to ${destination}`);
    expect(await readdir(destination)).toEqual(["01-cover.png"]);

    const zipDestination = join(parent, "instagram.zip");
    const zipped = await run(
      ["export", "welcome", "--platform", "instagram", "--output", zipDestination],
      workspace
    );
    expect(zipped.exitCode).toBe(0);
    expect((await readFile(zipDestination)).subarray(0, 4).toString("hex")).toBe("504b0304");

    const unsupported = await run(
      ["export", "welcome", "--platform", "linkedin"],
      workspace
    );
    expect(unsupported.exitCode).toBe(1);
    expect(unsupported.stderr).toContain(
      'unsupported platform "linkedin"; allowed: instagram'
    );
  }, 20_000);
});
