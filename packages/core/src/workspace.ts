import { link, mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parseDocument, stringify } from "yaml";
import { carouselJsonSchema, carouselSchema, type Carousel, workspaceConfigSchema } from "./schema.js";
import { formatIssue, formatYamlPath, SlipError } from "./errors.js";
import { validateCarouselImages } from "./image.js";
import { resolveWithinWorkspace } from "./path.js";
import { renderSlideSvg } from "./renderer.js";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}

function documentFor(slug: string, title: string): Carousel {
  return {
    schemaVersion: 1,
    id: slug,
    title,
    slides: [
      {
        id: "cover",
        layout: "type_only",
        content: {
          eyebrow: "A SLIP CAROUSEL",
          headline: title,
          body: "Edit this YAML file and watch the browser preview update."
        },
        options: {
          align: "left",
          tone: "paper",
          emphasisStyle: "italic"
        }
      }
    ]
  };
}

export async function initialiseWorkspace(directory: string): Promise<string> {
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  const marker = join(root, "slip.yaml");
  try {
    await stat(marker);
    throw new SlipError(`workspace already exists: ${marker}`, marker);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await Promise.all([
    mkdir(join(root, "schema"), { recursive: true }),
    mkdir(join(root, "assets"), { recursive: true }),
    mkdir(join(root, "carousels"), { recursive: true }),
    mkdir(join(root, "exports"), { recursive: true })
  ]);
  await atomicWrite(marker, stringify({ schemaVersion: 1, defaultTheme: "editorial" }));
  await atomicWrite(
    join(root, "schema", "carousel.schema.json"),
    `${JSON.stringify(carouselJsonSchema(), null, 2)}\n`
  );
  await atomicWrite(join(root, ".gitignore"), "exports/\n");
  await Promise.all([
    atomicWrite(join(root, "assets", ".gitkeep"), ""),
    atomicWrite(join(root, "exports", ".gitkeep"), ""),
    createCarousel(root, "welcome", "Welcome to Slip")
  ]);
  return root;
}

export async function assertWorkspace(rootPath: string): Promise<string> {
  const root = resolve(rootPath);
  const file = join(root, "slip.yaml");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new SlipError("not a Slip workspace; expected slip.yaml", file);
  }
  const parsed = parseDocument(raw);
  if (parsed.errors.length > 0) throw new SlipError(parsed.errors[0]!.message, file, "$");
  const input = parsed.toJS();
  const result = workspaceConfigSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new SlipError(formatIssue(issue, input), file, formatYamlPath(issue.path));
  }
  return root;
}

export async function createCarousel(rootPath: string, slug: string, title?: string): Promise<string> {
  const root = await assertWorkspace(rootPath);
  if (!slugPattern.test(slug)) {
    throw new SlipError(`invalid slug "${slug}"; use lowercase letters, numbers, and hyphens`, undefined, "$.id");
  }
  const destination = await resolveWithinWorkspace(root, "carousels", slug, "carousel.yaml");
  const document = carouselSchema.safeParse(
    documentFor(slug, title?.trim() || slug.replaceAll("-", " "))
  );
  if (!document.success) {
    const issue = document.error.issues[0]!;
    throw new SlipError(
      formatIssue(issue, documentFor(slug, title?.trim() || slug.replaceAll("-", " "))),
      destination,
      formatYamlPath(issue.path)
    );
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(stringify(document.data));
    await handle.sync();
    await handle.close();
    await link(temporary, destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") {
        throw new SlipError(`carousel already exists: ${destination}`, destination);
      }
      throw error;
    });
  } finally {
    await handle.close().catch(() => undefined);
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return destination;
}

export async function readCarousel(file: string, workspacePath?: string): Promise<Carousel> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    throw new SlipError((error as Error).message, file, "$");
  }
  const document = parseDocument(raw);
  if (document.errors.length > 0) {
    throw new SlipError(document.errors[0]!.message, file, "$");
  }
  const input = document.toJS();
  const result = carouselSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new SlipError(formatIssue(issue, input), file, formatYamlPath(issue.path));
  }
  if (result.data.id !== basename(dirname(file))) {
    throw new SlipError(
      `carousel id "${result.data.id}" must match directory "${basename(dirname(file))}"`,
      file,
      "$.id"
    );
  }
  if (result.data.slides.some((slide) => slide.layout !== "type_only")) {
    if (!workspacePath) {
      throw new SlipError(
        "workspace context is required to validate photographic slides",
        file,
        "$.slides"
      );
    }
    await validateCarouselImages(result.data, file, await assertWorkspace(workspacePath));
  }
  return result.data;
}

export async function carouselFiles(rootPath: string): Promise<string[]> {
  const root = await assertWorkspace(rootPath);
  const carousels = await resolveWithinWorkspace(root, "carousels");
  const entries = await readdir(carousels, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = await resolveWithinWorkspace(root, "carousels", entry.name, "carousel.yaml");
    try {
      await stat(file);
      files.push(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return files.sort();
}

export async function validateWorkspace(rootPath: string, slug?: string): Promise<string[]> {
  const root = await assertWorkspace(rootPath);
  const files = slug
    ? [await resolveWithinWorkspace(root, "carousels", slug, "carousel.yaml")]
    : await carouselFiles(root);
  await Promise.all(files.map(async (file) => {
    const carousel = await readCarousel(file, root);
    await Promise.all(carousel.slides.map((slide, slideIndex) =>
      renderSlideSvg(slide, {
        carouselFile: file,
        workspace: root,
        slideIndex,
        slideCount: carousel.slides.length
      })
    ));
  }));
  return files.map((file) => relative(root, file));
}
