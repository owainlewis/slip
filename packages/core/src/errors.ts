import type { ZodIssue } from "zod";

export class SlipError extends Error {
  constructor(
    message: string,
    readonly file?: string,
    readonly yamlPath?: string
  ) {
    super(message);
    this.name = "SlipError";
  }
}

export function formatYamlPath(path: PropertyKey[]): string {
  if (path.length === 0) return "$";
  return path.reduce<string>((result, part) => {
    if (typeof part === "number") return `${result}[${part}]`;
    const value = String(part);
    return result === "$" ? `$.${value}` : `${result}.${value}`;
  }, "$");
}

function valueAtPath(input: unknown, path: PropertyKey[]): unknown {
  return path.reduce<unknown>((value, part) => {
    if (value === null || typeof value !== "object") return undefined;
    return (value as Record<PropertyKey, unknown>)[part];
  }, input);
}

function serializeRejected(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return String(value);
    return serialized.length > 240 ? `${serialized.slice(0, 239)}…` : serialized;
  } catch {
    return String(value);
  }
}

export function formatIssue(issue: ZodIssue, input?: unknown): string {
  let rejected = valueAtPath(input, issue.path);
  if (
    issue.code === "unrecognized_keys" &&
    "keys" in issue &&
    rejected !== null &&
    typeof rejected === "object"
  ) {
    rejected = Object.fromEntries(
      issue.keys.map((key) => [key, (rejected as Record<string, unknown>)[key]])
    );
  }
  const received = rejected === undefined ? "" : `; received: ${serializeRejected(rejected)}`;
  const allowed =
    issue.code === "invalid_value" && "values" in issue
      ? `; allowed: ${(issue.values as unknown[]).map(String).join(", ")}`
      : "";
  return `${issue.message}${received}${allowed}`;
}
