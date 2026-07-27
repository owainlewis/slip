import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { startSlipServer } from "@slip/server";

const workspace = resolve(".tmp/playwright-workspace");
await rm(workspace, { recursive: true, force: true });
await cp(resolve("examples/editorial"), workspace, { recursive: true });

const server = await startSlipServer({ workspace, port: 4173 });
process.stdout.write(`E2E server: ${server.url}\n`);

const stop = async () => {
  await server.close();
  process.exit(0);
};
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
