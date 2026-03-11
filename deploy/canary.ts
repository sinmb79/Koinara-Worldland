import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ethers, keccak256, toUtf8Bytes } from "ethers";
import process from "node:process";
import "dotenv/config";
import {
  ROOT,
  getProfileFromArgv,
  getRpcCandidates,
  loadChainConfig,
  loadPrivateKeyFromEnv,
  loadTxOverridesFromEnv,
  resolveHealthyRpcUrl
} from "./common.js";

type DeploymentManifest = {
  contractAddresses: {
    registry: string;
  };
};

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

const REGISTRY_ABI = [
  "function createJob(bytes32 requestHash, bytes32 schemaHash, uint64 deadline, uint8 jobType) payable returns (uint256)",
  "function totalJobs() view returns (uint256)"
] as const;

function canonicalJson(value: unknown): string {
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

function computeRequestHash(manifest: JobManifest): string {
  return keccak256(toUtf8Bytes(canonicalJson(manifest.body)));
}

function computeSchemaHash(manifest: JobManifest): string {
  return keccak256(toUtf8Bytes(canonicalJson(manifest.body.schema)));
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

async function main(): Promise<void> {
  const profile = getProfileFromArgv();
  const chain = loadChainConfig(profile);
  const rpcUrl = await resolveHealthyRpcUrl(getRpcCandidates(chain), chain.chainId);
  const { privateKey, source } = loadCreatorKey();
  const txOverrides = loadTxOverridesFromEnv();
  const provider = new ethers.JsonRpcProvider(rpcUrl, chain.chainId || undefined);
  const wallet = new ethers.Wallet(privateKey, provider);
  const deploymentSuffix = readDeploymentSuffix();
  const manifestPath = resolve(ROOT, "deployments", `worldland-${profile}${deploymentSuffix}.json`);
  const deploymentManifest = loadJson<DeploymentManifest>(manifestPath);
  const networkRoot = resolve(ROOT, process.env.CANARY_ROOT?.trim() || defaultCanaryRoot());
  const premiumWei = process.env.CANARY_PREMIUM_WEI?.trim() || "0";
  const deadlineSeconds = Number(process.env.CANARY_DEADLINE_SECONDS?.trim() || "86400");

  if (!Number.isInteger(deadlineSeconds) || deadlineSeconds <= 0) {
    throw new Error("CANARY_DEADLINE_SECONDS must be a positive integer when set");
  }

  const body = {
    prompt: "Say hello from a local Koinara canary job.",
    contentType: "text/plain",
    schema: {
      type: "text"
    },
    metadata: {
      profile,
      network: chain.chainId,
      kind: "simple-canary"
    }
  };

  const manifest: JobManifest = {
    version: "koinara-job-manifest-v1",
    requestHash: "0x",
    body
  };

  manifest.requestHash = computeRequestHash(manifest);
  const schemaHash = computeSchemaHash(manifest);
  const targetManifestPath = resolve(networkRoot, "jobs", `${manifest.requestHash}.json`);
  mkdirSync(dirname(targetManifestPath), { recursive: true });
  writeFileSync(targetManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const registry = new ethers.Contract(
    deploymentManifest.contractAddresses.registry,
    REGISTRY_ABI,
    wallet
  );
  const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;
  const tx = await registry.createJob(
    manifest.requestHash,
    schemaHash,
    deadline,
    0,
    { value: premiumWei, ...txOverrides }
  );
  await tx.wait(chain.confirmationsRequired);
  const jobId = Number(await registry.totalJobs());

  console.log(`Canary manifest written to ${targetManifestPath}`);
  console.log(`Creator wallet: ${wallet.address}`);
  console.log(`Creator key source: ${source}`);
  console.log(`Registry: ${deploymentManifest.contractAddresses.registry}`);
  console.log(`Request hash: ${manifest.requestHash}`);
  console.log(`Schema hash: ${schemaHash}`);
  console.log(`Job ID: ${jobId}`);
  console.log(`Create tx: ${tx.hash}`);
}

function readDeploymentSuffix(): string {
  const version = process.env.DEPLOYMENT_VERSION?.trim().toLowerCase();
  if (version === "v2") {
    return "-v2";
  }

  const suffix = process.env.DEPLOYMENT_MANIFEST_SUFFIX?.trim();
  if (!suffix) {
    return "";
  }

  return suffix.startsWith("-") ? suffix : `-${suffix}`;
}

function defaultCanaryRoot(): string {
  const suffix = readDeploymentSuffix();
  return suffix === "-v2" ? ".koinara-worldland-v2/network" : "node/.koinara-worldland/network";
}

function loadCreatorKey(): { privateKey: string; source: "creator" | "deployer" } {
  const creatorKey = process.env.CREATOR_PRIVATE_KEY?.trim();
  if (creatorKey) {
    return { privateKey: creatorKey, source: "creator" };
  }

  const creatorKeyFile = process.env.CREATOR_PRIVATE_KEY_FILE?.trim();
  if (creatorKeyFile) {
    const resolved = resolve(ROOT, creatorKeyFile);
    return { privateKey: readFileSync(resolved, "utf8").trim(), source: "creator" };
  }

  const loaded = loadPrivateKeyFromEnv("PRIVATE_KEY", "PRIVATE_KEY_FILE");
  return { privateKey: loaded.privateKey, source: "deployer" };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
