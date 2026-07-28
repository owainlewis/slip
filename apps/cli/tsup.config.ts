import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: [
    "@fontsource/bodoni-moda",
    "@fontsource/instrument-sans",
    "@hono/node-server",
    "@resvg/resvg-js",
    "chokidar",
    "commander",
    "fontkit",
    "hono",
    "jszip",
    "lightningcss",
    "open",
    "pdf-lib",
    "sharp",
    "satori",
    "vite",
    "yaml",
    "zod"
  ],
  noExternal: [/^@slip\//]
});
