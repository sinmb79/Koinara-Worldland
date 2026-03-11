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
import { getRpcCandidates } from "./rpc.js";

export function loadRuntimeConfig(options?: { allowMissingWallet?: boolean }): RuntimeConfig {
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

  const chainPath = resolve(rootDir, "config", `chain.${chainProfile}.json`);
  const chain = JSON.parse(readFileSync(chainPath, "utf8")) as ChainConfig;
  const deploymentManifestPath = resolve(packageRoot, fileConfig.deploymentManifestPath);
  const deploymentManifest = JSON.parse(
    readFileSync(deploymentManifestPath, "utf8")
  ) as DeploymentManifest;

  const walletResolution = loadWallet(packageRoot, options?.allowMissingWallet === true);
  const rpcCandidates = getRpcCandidates(chain, process.env.RPC_URL);

  return {
    packageRoot,
    rootDir,
    role,
    walletPrivateKey: walletResolution.privateKey,
    walletSource: walletResolution.source,
    chainProfile,
    chain,
    deploymentManifest,
    pollIntervalMs: fileConfig.pollIntervalMs,
    manifestRoots: fileConfig.manifestRoots.map((entry) => resolveMaybe(packageRoot, entry)),
    receiptRoots: fileConfig.receiptRoots.map((entry) => resolveMaybe(packageRoot, entry)),
    artifactOutputDir: resolveMaybe(packageRoot, fileConfig.artifactOutputDir),
    rpcCandidates,
    provider: fileConfig.provider,
    verifier: fileConfig.verifier,
    openAiApiKey: process.env.OPENAI_API_KEY
  };
}

function loadWallet(
  baseDir: string,
  allowMissingWallet: boolean
): { privateKey: string; source: "env" | "keyfile" } {
  const inline = process.env.WALLET_PRIVATE_KEY?.trim();
  if (inline) {
    return { privateKey: inline, source: "env" };
  }

  const keyfile = process.env.WALLET_KEYFILE?.trim();
  if (keyfile) {
    const resolved = resolveMaybe(baseDir, keyfile);
    if (!existsSync(resolved)) {
      throw new Error(`WALLET_KEYFILE does not exist: ${keyfile}`);
    }
    return {
      privateKey: readFileSync(resolved, "utf8").trim(),
      source: "keyfile"
    };
  }

  if (allowMissingWallet) {
    return { privateKey: "", source: "env" };
  }

  throw new Error("WALLET_PRIVATE_KEY or WALLET_KEYFILE is required");
}

function resolveMaybe(baseDir: string, target: string): string {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return target;
  }

  return resolve(baseDir, target);
}
