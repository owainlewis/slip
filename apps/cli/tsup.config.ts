import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: [
    "@fontsource/inter",
    "@fontsource/source-serif-4",
    "@hono/node-server",
    "@resvg/resvg-js",
    "chokidar",
    "commander",
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
