import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initialiseWorkspace } from "@slip/core";
import { startSlipServer } from "@slip/server";

const workspace = resolve(".tmp/playwright-workspace");
await rm(workspace, { recursive: true, force: true });
await initialiseWorkspace(workspace);
await writeFile(
  resolve(workspace, "carousels/welcome/carousel.yaml"),
  `schemaVersion: 1
id: welcome
title: Welcome to Slip
slides:
  - id: cover
    layout: type_only
    content:
      eyebrow: LOCAL FIRST
      headline: Make the idea clear
      body: A production renderer turns strict YAML into an editorial carousel.
    options:
      align: left
  - id: close
    layout: type_only
    content:
      headline: Keep editing in your own tools
    options:
      align: center
`
);

const server = await startSlipServer({ workspace, port: 4173 });
process.stdout.write(`E2E server: ${server.url}\n`);

const stop = async () => {
  await server.close();
  process.exit(0);
};
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
