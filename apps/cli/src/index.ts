#!/usr/bin/env node
import process from "node:process";
import { resolve } from "node:path";
import { Command } from "commander";
import open from "open";
import {
  createCarousel,
  describeLayout,
  exportInstagram,
  exportLinkedIn,
  initialiseWorkspace,
  layoutDefinitions,
  listLayouts,
  SlipError,
  validateWorkspace
} from "@slip/core";
import { startSlipServer } from "@slip/server";

export function createProgram(): Command {
  const program = new Command()
    .name("slip")
    .description("Declarative editorial carousel studio")
    .version("0.1.0")
    .showHelpAfterError();

  program
    .command("init")
    .argument("<directory>")
    .description("Create a Slip workspace")
    .action(async (directory: string) => {
      const root = await initialiseWorkspace(directory);
      process.stdout.write(`Created Slip workspace at ${root}\n`);
    });

  program
    .command("new")
    .argument("<slug>")
    .option("--title <title>")
    .description("Create a type_only carousel in the current workspace")
    .action(async (slug: string, options: { title?: string }) => {
      const file = await createCarousel(process.cwd(), slug, options.title);
      process.stdout.write(`Created ${file}\n`);
    });

  program
    .command("layouts")
    .argument("[layout]")
    .description("List layouts or document one layout")
    .action((layout?: string) => {
      if (!layout) {
        process.stdout.write(`${listLayouts()}\n`);
        return;
      }
      const description = describeLayout(layout);
      if (!description) {
        throw new SlipError(
          `unknown layout "${layout}"; allowed: ${layoutDefinitions.map((item) => item.id).join(", ")}`
        );
      }
      process.stdout.write(`${description}\n`);
    });

  program
    .command("validate")
    .argument("[carousel]")
    .description("Validate one carousel or the whole workspace")
    .action(async (carousel?: string) => {
      const files = await validateWorkspace(process.cwd(), carousel);
      files.forEach((file) => process.stdout.write(`valid ${file}\n`));
    });

  program
    .command("export")
    .argument("<carousel>")
    .requiredOption("--platform <platform>", "export platform")
    .option("--output <path>", "output directory, .zip file, or .pdf file")
    .description("Export a validated carousel")
    .action(async (
      carousel: string,
      options: { platform: string; output?: string }
    ) => {
      if (options.platform !== "instagram" && options.platform !== "linkedin") {
        throw new SlipError(
          `unsupported platform "${options.platform}"; allowed: instagram, linkedin`
        );
      }
      if (options.platform === "instagram") {
        const result = await exportInstagram(process.cwd(), carousel, options.output);
        process.stdout.write(
          `Exported ${result.files.length} Instagram PNG${result.files.length === 1 ? "" : "s"} to ${result.destination}\n`
        );
      } else {
        const result = await exportLinkedIn(process.cwd(), carousel, options.output);
        process.stdout.write(
          `Exported ${result.pageCount}-page LinkedIn PDF to ${result.destination}\n`
        );
      }
    });

  program
    .command("dev")
    .argument("[workspace]")
    .option("--no-open", "do not open the browser")
    .option("--port <port>", "port to bind", (value) => Number.parseInt(value, 10))
    .description("Start the read-only browser preview")
    .action(async (workspace: string | undefined, options: { open: boolean; port?: number }) => {
      const server = await startSlipServer({
        workspace: resolve(workspace ?? process.cwd()),
        port: options.port
      });
      process.stdout.write(`Slip preview: ${server.url}\n`);
      if (options.open) await open(server.url);
      const stop = async () => {
        await server.close();
        process.exit(0);
      };
      process.once("SIGINT", () => void stop());
      process.once("SIGTERM", () => void stop());
    });

  return program;
}

async function main(): Promise<void> {
  try {
    await createProgram().parseAsync(process.argv);
  } catch (error) {
    if (error instanceof SlipError) {
      const location = [error.file, error.yamlPath].filter(Boolean).join(":");
      process.stderr.write(`${location || "slip"}: ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
