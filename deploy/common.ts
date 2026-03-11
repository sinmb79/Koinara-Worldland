import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ethers } from "ethers";

export type Profile = "testnet" | "mainnet";

export type ChainConfig = {
  chainId: number;
  rpcUrl: string;
  backupRpcUrls: string[];
  explorerBaseUrl: string;
  confirmationsRequired: number;
  nativeToken: Record<string, unknown>;
};

export type DeployParams = {
  epochDuration: number;
  halvingInterval: number;
  initialEpochEmission: string;
  expectedTokenCap: string;
  gitRef: string;
};

export type TxOverrides = {
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
};

export const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function getProfileFromArgv(argv = process.argv): Profile {
  const profileFlag = argv.find((arg) => arg.startsWith("--profile"));
  if (!profileFlag) {
    throw new Error("Missing --profile testnet|mainnet");
  }

  const [, maybeValue] = profileFlag.split("=");
  const value = maybeValue ?? argv[argv.indexOf(profileFlag) + 1];
  if (value !== "testnet" && value !== "mainnet") {
    throw new Error("Profile must be testnet or mainnet");
  }

  return value;
}

export function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function resolveChainConfigPath(profile: Profile): string {
  const explicitPath = process.env.CHAIN_CONFIG_FILE?.trim() ?? process.env.WORLDLAND_CHAIN_CONFIG_FILE?.trim();
  if (explicitPath) {
    return resolveMaybe(ROOT, explicitPath);
  }

  const localOverride = resolve(ROOT, "config", `chain.${profile}.local.json`);
  if (existsSync(localOverride)) {
    return localOverride;
  }

  return resolve(ROOT, "config", `chain.${profile}.json`);
}

export function loadChainConfig(profile: Profile): ChainConfig {
  const config = loadJson<ChainConfig>(resolveChainConfigPath(profile));
  const chainIdOverride = readIntegerEnv("CHAIN_ID") ?? readIntegerEnv("WORLDLAND_CHAIN_ID");

  return {
    ...config,
    chainId: chainIdOverride ?? config.chainId
  };
}

export function loadDeployParams(profile: Profile): DeployParams {
  const params = loadJson<DeployParams>(resolve(ROOT, "deploy", `params.${profile}.json`));

  return {
    epochDuration: readIntegerEnv("EPOCH_DURATION") ?? params.epochDuration,
    halvingInterval: readIntegerEnv("HALVING_INTERVAL") ?? params.halvingInterval,
    initialEpochEmission:
      readBigIntEnv("INITIAL_EPOCH_EMISSION_WEI")?.toString() ?? params.initialEpochEmission,
    expectedTokenCap:
      readBigIntEnv("EXPECTED_TOKEN_CAP_WEI")?.toString() ?? params.expectedTokenCap,
    gitRef: process.env.GIT_REF_OVERRIDE?.trim() || params.gitRef
  };
}

export function getRpcCandidates(chain: ChainConfig): string[] {
  const candidates = [
    process.env.RPC_URL,
    process.env.WORLDLAND_RPC_URL,
    chain.rpcUrl,
    ...(chain.backupRpcUrls ?? [])
  ]
    .filter((entry): entry is string => Boolean(entry && entry.trim()))
    .map((entry) => entry.trim());

  return [...new Set(candidates)];
}

export async function resolveHealthyRpcUrl(candidates: string[], expectedChainId = 0): Promise<string> {
  if (candidates.length === 0) {
    throw new Error("No RPC candidates configured");
  }

  let lastError = "No RPC tried";
  for (const rpcUrl of candidates) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, expectedChainId || undefined);
      const network = await provider.getNetwork();
      if (expectedChainId && Number(network.chainId) !== expectedChainId) {
        throw new Error(`wrong chainId ${network.chainId}`);
      }
      return rpcUrl;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`Unable to reach a healthy RPC endpoint. Last error: ${lastError}`);
}

export function loadPrivateKeyFromEnv(
  privateKeyEnvName: string,
  keyfileEnvName: string,
  baseDir = ROOT
): { privateKey: string; source: "env" | "keyfile" } {
  const direct = process.env[privateKeyEnvName]?.trim();
  if (direct) {
    return { privateKey: direct, source: "env" };
  }

  const keyfile = process.env[keyfileEnvName]?.trim();
  if (keyfile) {
    const keyfilePath = resolveMaybe(baseDir, keyfile);
    if (!existsSync(keyfilePath)) {
      throw new Error(`${keyfileEnvName} points to a missing file: ${keyfile}`);
    }
    return {
      privateKey: readFileSync(keyfilePath, "utf8").trim(),
      source: "keyfile"
    };
  }

  throw new Error(`${privateKeyEnvName} or ${keyfileEnvName} is required`);
}

export function ensureFoundryBuild(root = ROOT): void {
  if (process.env.SKIP_FORGE_BUILD === "1") {
    console.log("Skipping forge build because SKIP_FORGE_BUILD=1");
    return;
  }

  const result = spawnSync(resolveFoundryBinary("forge"), ["build"], {
    cwd: root,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error("forge build failed");
  }
}

export function hasForgeInstalled(): boolean {
  const result = spawnSync(resolveFoundryBinary("forge"), ["--version"], {
    cwd: ROOT,
    stdio: "ignore"
  });

  return !result.error && result.status === 0;
}

export function resolveMaybe(baseDir: string, target: string): string {
  if (/^https?:\/\//.test(target)) {
    return target;
  }

  return resolve(baseDir, target);
}

export function isPlaceholderConfig(chain: ChainConfig): string[] {
  const issues: string[] = [];
  if (!chain.chainId) {
    issues.push("chainId is still 0");
  }
  if (!chain.rpcUrl) {
    issues.push("rpcUrl is empty");
  }
  if (typeof chain.nativeToken?.symbol !== "string" || !chain.nativeToken.symbol) {
    issues.push("nativeToken.symbol is empty");
  }
  if (chain.nativeToken?.type === "erc20" && !("address" in chain.nativeToken) ) {
    issues.push("nativeToken.address is missing for ERC20 profile");
  }
  if (chain.nativeToken?.type === "erc20" && !String(chain.nativeToken.address ?? "").trim()) {
    issues.push("nativeToken.address is empty for ERC20 profile");
  }

  return issues;
}

export function loadTxOverridesFromEnv(): TxOverrides {
  const gasPrice = readBigIntEnv("GAS_PRICE_WEI") ?? readGweiEnv("GAS_PRICE_GWEI");
  if (gasPrice !== undefined) {
    return { gasPrice };
  }

  const maxFeePerGas =
    readBigIntEnv("MAX_FEE_PER_GAS_WEI") ?? readGweiEnv("MAX_FEE_PER_GAS_GWEI");
  const maxPriorityFeePerGas =
    readBigIntEnv("MAX_PRIORITY_FEE_PER_GAS_WEI") ??
    readGweiEnv("MAX_PRIORITY_FEE_PER_GAS_GWEI");

  return {
    ...(maxFeePerGas !== undefined ? { maxFeePerGas } : {}),
    ...(maxPriorityFeePerGas !== undefined ? { maxPriorityFeePerGas } : {})
  };
}

export function resolveFoundryBinary(name: "forge" | "cast" | "anvil" | "chisel"): string {
  const extension = process.platform === "win32" ? ".exe" : "";
  const homeDir = process.env.USERPROFILE ?? process.env.HOME;

  if (homeDir) {
    const localInstall = resolve(homeDir, ".foundry", "bin", `${name}${extension}`);
    if (existsSync(localInstall)) {
      return localInstall;
    }
  }

  return name;
}

function readIntegerEnv(name: string): number | undefined {
  const value = process.env[name]?.trim();
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer when set`);
  }

  return parsed;
}

function readBigIntEnv(name: string): bigint | undefined {
  const value = process.env[name]?.trim();
  if (!value) {
    return undefined;
  }

  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error(`${name} must be a positive integer in wei when set`);
  }
}

function readGweiEnv(name: string): bigint | undefined {
  const value = process.env[name]?.trim();
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number in gwei when set`);
  }

  return ethers.parseUnits(String(parsed), "gwei");
}
