import { createServer as createNodeServer, type IncomingMessage } from "node:http";
import { stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import {
  assertWorkspace,
  carouselFiles,
  readCarousel,
  renderSlideSvg,
  SlipError
} from "@slip/core";
import chokidar, { type FSWatcher } from "chokidar";
import { Hono } from "hono";
import { createServer as createViteServer, type ViteDevServer } from "vite";

export interface CarouselPreview {
  slug: string;
  title: string;
  slideCount: number;
  updatedAt: string;
  slides: Array<{ id: string; headline: string; svg: string }>;
}

interface CacheEntry {
  file: string;
  carousel?: CarouselPreview;
  error?: { file: string; path: string; message: string };
}

interface StartServerOptions {
  workspace: string;
  port?: number;
  host?: "127.0.0.1";
  webRoot?: string;
}

export interface SlipServer {
  url: string;
  close(): Promise<void>;
}

function errorPayload(error: unknown, workspace: string): { file: string; path: string; message: string } {
  if (error instanceof SlipError) {
    return {
      file: error.file ? relative(workspace, error.file) : "carousel.yaml",
      path: error.yamlPath ?? "$",
      message: error.message
    };
  }
  return { file: "carousel.yaml", path: "$", message: (error as Error).message };
}

async function renderCarousel(file: string): Promise<CarouselPreview> {
  const carousel = await readCarousel(file);
  const fileStat = await stat(file);
  const slides = await Promise.all(
    carousel.slides.map(async (slide) => ({
      id: slide.id,
      headline: slide.content.headline,
      svg: await renderSlideSvg(slide)
    }))
  );
  return {
    slug: carousel.id,
    title: carousel.title,
    slideCount: slides.length,
    updatedAt: fileStat.mtime.toISOString(),
    slides
  };
}

function requestAllowed(request: IncomingMessage, port: number): boolean {
  const host = request.headers.host;
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (!host || !allowedHosts.has(host)) return false;
  const origin = request.headers.origin;
  return !origin || origin === `http://${host}`;
}

export async function startSlipServer(options: StartServerOptions): Promise<SlipServer> {
  const workspace = await assertWorkspace(options.workspace);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const cache = new Map<string, CacheEntry>();
  let version = 0;

  const load = async (file: string): Promise<void> => {
    const slug = file.split(/[\\/]/).at(-2)!;
    const previous = cache.get(slug);
    try {
      const carousel = await renderCarousel(file);
      cache.set(slug, { file, carousel });
    } catch (error) {
      cache.set(slug, { file, carousel: previous?.carousel, error: errorPayload(error, workspace) });
    }
    version += 1;
  };

  await Promise.all((await carouselFiles(workspace)).map(load));

  const app = new Hono();
  app.get("/api/state", (context) =>
    context.json({
      version,
      carousels: [...cache.values()].flatMap((entry) =>
        entry.carousel
          ? [{
              slug: entry.carousel.slug,
              title: entry.carousel.title,
              slideCount: entry.carousel.slideCount,
              updatedAt: entry.carousel.updatedAt
            }]
          : []
      ),
      errors: [...cache.values()].flatMap((entry) => (entry.error ? [entry.error] : []))
    })
  );
  app.get("/api/carousels/:slug", (context) => {
    const slug = context.req.param("slug");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return context.json({ error: "invalid carousel slug" }, 400);
    }
    const entry = cache.get(slug);
    if (!entry?.carousel) return context.json({ error: "carousel not found" }, 404);
    return context.json({ carousel: entry.carousel, error: entry.error });
  });
  app.notFound((context) => context.json({ error: "not found" }, 404));
  const honoListener = getRequestListener(app.fetch);

  const webRoot = options.webRoot ?? fileURLToPath(new URL("../../web", import.meta.url));
  const webRequire = createRequire(join(webRoot, "package.json"));
  const fontRoots = [
    dirname(webRequire.resolve("@fontsource/inter/package.json")),
    dirname(webRequire.resolve("@fontsource/source-serif-4/package.json"))
  ];
  let vite: ViteDevServer | undefined;
  let watcher: FSWatcher | undefined;
  let actualPort = port;

  const server = createNodeServer((request, response) => {
    if (!requestAllowed(request, actualPort)) {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unexpected Host or Origin" }));
      return;
    }
    if (request.url?.startsWith("/api/")) {
      void honoListener(request, response);
      return;
    }
    vite!.middlewares(request, response, (error?: unknown) => {
      if (error) {
        response.writeHead(500);
        response.end((error as Error).message);
      }
    });
  });

  try {
    vite = await createViteServer({
      root: webRoot,
      server: {
        middlewareMode: true,
        hmr: false,
        fs: {
          strict: true,
          allow: [webRoot, ...fontRoots]
        }
      },
      appType: "spa",
      logLevel: "error"
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind a TCP port");
    actualPort = address.port;
    watcher = chokidar.watch(`${workspace}/carousels`, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 }
    });
    watcher.on("add", (file) => {
      if (file.endsWith("/carousel.yaml")) void load(file);
    });
    watcher.on("change", (file) => {
      if (file.endsWith("/carousel.yaml")) void load(file);
    });
    watcher.on("unlink", (file) => {
      if (!file.endsWith("/carousel.yaml")) return;
      const slug = file.split(/[\\/]/).at(-2)!;
      cache.delete(slug);
      version += 1;
    });
  } catch (error) {
    await vite?.close();
    server.close();
    throw error;
  }

  return {
    url: `http://${host}:${actualPort}`,
    async close() {
      await watcher?.close();
      await vite?.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  };
}
