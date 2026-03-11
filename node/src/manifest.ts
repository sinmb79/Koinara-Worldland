import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { keccak256, toUtf8Bytes } from "ethers";
import type { JobManifest, SubmissionReceipt } from "./types.js";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function computeRequestHash(manifest: JobManifest): string {
  return keccak256(toUtf8Bytes(canonicalJson(manifest.body)));
}

export function computeSchemaHash(manifest: JobManifest): string {
  return keccak256(toUtf8Bytes(canonicalJson(manifest.body.schema)));
}

export function computeResponseHash(receipt: SubmissionReceipt): string {
  return keccak256(toUtf8Bytes(canonicalJson(receipt.body)));
}

export async function resolveJobManifest(
  roots: string[],
  requestHash: string
): Promise<JobManifest | null> {
  for (const root of roots) {
    const candidate = await readJsonMaybe<JobManifest>(joinRoot(root, "jobs", `${requestHash}.json`));
    if (!candidate) {
      continue;
    }
    if (candidate.version !== "koinara-job-manifest-v1") {
      continue;
    }
    if (candidate.requestHash.toLowerCase() !== requestHash.toLowerCase()) {
      continue;
    }
    if (computeRequestHash(candidate).toLowerCase() !== requestHash.toLowerCase()) {
      continue;
    }
    return candidate;
  }

  return null;
}

export async function resolveSubmissionReceipt(
  roots: string[],
  jobId: number,
  responseHash: string
): Promise<SubmissionReceipt | null> {
  for (const root of roots) {
    const candidate = await readJsonMaybe<SubmissionReceipt>(
      joinRoot(root, "receipts", `${jobId}-${responseHash}.json`)
    );
    if (!candidate) {
      continue;
    }
    if (candidate.version !== "koinara-submission-receipt-v1") {
      continue;
    }
    if (candidate.jobId !== jobId) {
      continue;
    }
    if (candidate.responseHash.toLowerCase() !== responseHash.toLowerCase()) {
      continue;
    }
    if (computeResponseHash(candidate).toLowerCase() !== responseHash.toLowerCase()) {
      continue;
    }
    return candidate;
  }

  return null;
}

export function writeSubmissionReceipt(
  roots: string[],
  receipt: SubmissionReceipt
): { path: string } {
  const localRoot = roots.find((entry) => !isHttpRoot(entry));
  if (!localRoot) {
    throw new Error("At least one local receipt root is required for writes");
  }

  const targetPath = resolve(localRoot, "receipts", `${receipt.jobId}-${receipt.responseHash}.json`);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return { path: targetPath };
}

export function writeResultArtifact(
  artifactRoot: string,
  jobId: number,
  responseHash: string,
  output: unknown
): { path: string } {
  const targetPath = resolve(artifactRoot, "results", `${jobId}-${responseHash}.json`);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  return { path: targetPath };
}

async function readJsonMaybe<T>(source: string): Promise<T | null> {
  try {
    if (isHttpRoot(source)) {
      const response = await fetch(source);
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as T;
    }

    return JSON.parse(readFileSync(source, "utf8")) as T;
  } catch {
    return null;
  }
}

function isHttpRoot(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function joinRoot(root: string, section: string, filename: string): string {
  if (isHttpRoot(root)) {
    return `${root.replace(/\/$/, "")}/${section}/${filename}`;
  }

  return resolve(root, section, filename);
}
