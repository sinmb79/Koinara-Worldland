import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import "dotenv/config";

type Profile = "testnet" | "mainnet";

type ChainConfig = {
  chainId: number;
  rpcUrl: string;
  backupRpcUrls: string[];
  explorerBaseUrl: string;
  confirmationsRequired: number;
  nativeToken: Record<string, unknown>;
};

type DeployParams = {
  epochDuration: number;
  halvingInterval: number;
  initialEpochEmission: string;
  expectedTokenCap: string;
  gitRef: string;
};

type DeploymentManifest = {
  contractAddresses: Record<string, string>;
  deployTxHashes: Record<string, string>;
  blockNumbers: Record<string, number>;
  chainId: number;
  epochParams: {
    genesisTimestamp: number;
    epochDuration: number;
    halvingInterval: number;
    initialEpochEmission: string;
  };
  tokenCap: string;
  gitRef: string;
};

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const registryAbi = [
  "function verifier() view returns (address)",
  "function rewardDistributor() view returns (address)",
  "function admin() view returns (address)"
];

const tokenAbi = [
  "function minter() view returns (address)",
  "function admin() view returns (address)",
  "function cap() view returns (uint256)"
];

const distributorAbi = [
  "function epochDuration() view returns (uint256)",
  "function halvingInterval() view returns (uint256)",
  "function initialEpochEmission() view returns (uint256)",
  "function genesisTimestamp() view returns (uint256)"
];

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function getProfile(): Profile {
  const profileFlag = process.argv.find((arg) => arg.startsWith("--profile"));
  if (!profileFlag) {
    throw new Error("Missing --profile testnet|mainnet");
  }

  const [, maybeValue] = profileFlag.split("=");
  const value = maybeValue ?? process.argv[process.argv.indexOf(profileFlag) + 1];
  if (value !== "testnet" && value !== "mainnet") {
    throw new Error("Profile must be testnet or mainnet");
  }

  return value;
}

async function assertEqual<T>(label: string, actual: T, expected: T): Promise<void> {
  if (actual !== expected) {
    throw new Error(`${label} failed: expected ${expected}, got ${actual}`);
  }

  console.log(`ok ${label}`);
}

async function main(): Promise<void> {
  const profile = getProfile();
  const chain = loadJson<ChainConfig>(resolve(ROOT, "config", `chain.${profile}.json`));
  const params = loadJson<DeployParams>(resolve(ROOT, "deploy", `params.${profile}.json`));
  const manifest = loadJson<DeploymentManifest>(
    resolve(ROOT, "deployments", `worldland-${profile}.json`)
  );

  if (!chain.rpcUrl) {
    throw new Error(`config/chain.${profile}.json is missing rpcUrl`);
  }

  const provider = new ethers.JsonRpcProvider(chain.rpcUrl, chain.chainId || undefined);
  const registry = new ethers.Contract(
    manifest.contractAddresses.registry,
    registryAbi,
    provider
  );
  const token = new ethers.Contract(manifest.contractAddresses.token, tokenAbi, provider);
  const distributor = new ethers.Contract(
    manifest.contractAddresses.rewardDistributor,
    distributorAbi,
    provider
  );

  await assertEqual("registry.verifier", await registry.verifier(), manifest.contractAddresses.verifier);
  await assertEqual(
    "registry.rewardDistributor",
    await registry.rewardDistributor(),
    manifest.contractAddresses.rewardDistributor
  );
  await assertEqual("token.minter", await token.minter(), manifest.contractAddresses.rewardDistributor);
  await assertEqual("registry.admin", await registry.admin(), ethers.ZeroAddress);
  await assertEqual("token.admin", await token.admin(), ethers.ZeroAddress);
  await assertEqual("token.cap", (await token.cap()).toString(), params.expectedTokenCap);
  await assertEqual(
    "epochDuration",
    (await distributor.epochDuration()).toString(),
    String(params.epochDuration)
  );
  await assertEqual(
    "halvingInterval",
    (await distributor.halvingInterval()).toString(),
    String(params.halvingInterval)
  );
  await assertEqual(
    "initialEpochEmission",
    (await distributor.initialEpochEmission()).toString(),
    params.initialEpochEmission
  );
  await assertEqual(
    "manifest.genesisTimestamp",
    (await distributor.genesisTimestamp()).toString(),
    String(manifest.epochParams.genesisTimestamp)
  );
  await assertEqual("gitRef", manifest.gitRef, params.gitRef);

  console.log("Worldland deployment verification completed successfully.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
