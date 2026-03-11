import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toUtf8Bytes } from "ethers";

type JobManifest = {
  version: "koinara-job-manifest-v1";
  requestHash: string;
  body: {
    prompt: string;
    contentType: string;
    schema: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const NETWORK_ROOT = resolve(ROOT, "node", ".koinara-worldland", "network");

const body = {
  prompt: "Say hello from a local Koinara canary job.",
  contentType: "text/plain",
  schema: {
    type: "text"
  },
  metadata: {
    profile: "anvil-canary"
  }
};

const manifest: JobManifest = {
  version: "koinara-job-manifest-v1",
  requestHash: keccak256(toUtf8Bytes(canonicalJson(body))),
  body
};

mkdirSync(resolve(NETWORK_ROOT, "jobs"), { recursive: true });
writeFileSync(
  resolve(NETWORK_ROOT, "jobs", `${manifest.requestHash}.json`),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

console.log("Wrote a sample canary manifest to:");
console.log(resolve(NETWORK_ROOT, "jobs", `${manifest.requestHash}.json`));
console.log("Use this with a local Anvil deployment to complete the full canary flow.");
