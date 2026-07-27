import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
});
