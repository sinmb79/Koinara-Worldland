import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { ethers } from "ethers";
import "dotenv/config";
import {
  ROOT,
  getProfileFromArgv,
  getRpcCandidates,
  loadChainConfig,
  loadDeployParams,
  resolveHealthyRpcUrl
} from "./common.js";

type DeploymentManifest = {
  contractAddresses: Record<string, string>;
  deployTxHashes: Record<string, string>;
  blockNumbers: Record<string, number>;
  chainId: number;
  deployer?: string;
  rpcUrlUsed?: string;
  epochParams: {
    genesisTimestamp: number;
    epochDuration: number;
    halvingInterval: number;
    initialEpochEmission: string;
  };
  tokenCap: string;
  gitRef: string;
};

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

async function assertEqual<T>(label: string, actual: T, expected: T): Promise<void> {
  if (actual !== expected) {
    throw new Error(`${label} failed: expected ${expected}, got ${actual}`);
  }

  console.log(`ok ${label}`);
}

async function main(): Promise<void> {
  const profile = getProfileFromArgv();
  const chain = loadChainConfig(profile);
  const params = loadDeployParams(profile);
  const manifest = loadJson<DeploymentManifest>(
    resolve(ROOT, "deployments", `worldland-${profile}.json`)
  );

  const rpcUrl = await resolveHealthyRpcUrl(getRpcCandidates(chain), chain.chainId);
  const provider = new ethers.JsonRpcProvider(rpcUrl, chain.chainId || undefined);
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
  await assertEqual("manifest.chainId", String(manifest.chainId), String(chain.chainId));

  console.log("Worldland deployment verification completed successfully.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
