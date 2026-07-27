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
    "chokidar",
    "commander",
    "hono",
    "lightningcss",
    "open",
    "satori",
    "vite",
    "yaml",
    "zod"
  ],
  noExternal: [/^@slip\//]
});
