import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type {
  ChainConfig,
  ChainProfileName,
  DeploymentManifest,
  FileNodeConfig,
  NodeRole,
  RuntimeConfig
} from "./types.js";

export function loadRuntimeConfig(): RuntimeConfig {
  const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const rootDir = resolve(packageRoot, "..");

  const envLocalPath = resolve(packageRoot, ".env.local");
  const envPath = resolve(packageRoot, ".env");

  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  if (existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath, override: true });
  }

  const nodeConfigPath = resolve(packageRoot, "node.config.json");
  if (!existsSync(nodeConfigPath)) {
    throw new Error(`Missing ${nodeConfigPath}. Run npm run setup first.`);
  }

  const fileConfig = JSON.parse(readFileSync(nodeConfigPath, "utf8")) as FileNodeConfig;
  const chainProfile = (process.env.CHAIN_PROFILE ?? fileConfig.chainProfile) as ChainProfileName;
  const role = (process.env.NODE_ROLE ?? "provider") as NodeRole;
  const walletPrivateKey = process.env.WALLET_PRIVATE_KEY;

  if (!walletPrivateKey) {
    throw new Error("WALLET_PRIVATE_KEY is required");
  }

  const chainPath = resolve(rootDir, "config", `chain.${chainProfile}.json`);
  const chain = JSON.parse(readFileSync(chainPath, "utf8")) as ChainConfig;
  const deploymentManifestPath = resolve(packageRoot, fileConfig.deploymentManifestPath);
  const deploymentManifest = JSON.parse(
    readFileSync(deploymentManifestPath, "utf8")
  ) as DeploymentManifest;

  return {
    packageRoot,
    rootDir,
    role,
    walletPrivateKey,
    chainProfile,
    chain,
    deploymentManifest,
    pollIntervalMs: fileConfig.pollIntervalMs,
    manifestRoots: fileConfig.manifestRoots.map((entry) => resolveMaybe(packageRoot, entry)),
    receiptRoots: fileConfig.receiptRoots.map((entry) => resolveMaybe(packageRoot, entry)),
    artifactOutputDir: resolveMaybe(packageRoot, fileConfig.artifactOutputDir),
    provider: fileConfig.provider,
    verifier: fileConfig.verifier,
    openAiApiKey: process.env.OPENAI_API_KEY
  };
}

function resolveMaybe(baseDir: string, target: string): string {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return target;
  }

  return resolve(baseDir, target);
}
