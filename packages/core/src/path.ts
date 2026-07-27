import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { SlipError } from "./errors.js";

function assertContained(root: string, candidate: string): void {
  const rel = relative(root, candidate);
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) {
    throw new SlipError(`path escapes workspace: ${candidate}`);
  }
}

async function nearestExisting(path: string): Promise<string> {
  let current = path;
  for (;;) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

export async function resolveWithinWorkspace(rootPath: string, ...parts: string[]): Promise<string> {
  const root = await realpath(rootPath);
  const candidate = resolve(root, ...parts);
  assertContained(root, candidate);
  const existing = await nearestExisting(candidate);
  const existingReal = await realpath(existing);
  assertContained(root, existingReal);
  return candidate;
}
