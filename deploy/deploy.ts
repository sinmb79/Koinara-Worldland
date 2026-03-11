import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

type Artifact = {
  abi: unknown[];
  bytecode: { object: string };
};

type Manifest = {
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

function ensureFoundryBuild(): void {
  const result = spawnSync("forge", ["build"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    throw new Error("forge build failed");
  }
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadArtifact(name: string): Artifact {
  const artifactPath = resolve(ROOT, "out", `${name}.sol`, `${name}.json`);
  return loadJson<Artifact>(artifactPath);
}

async function deployContract(
  signer: ethers.Wallet,
  artifact: Artifact,
  args: unknown[] = []
): Promise<{ contract: ethers.Contract; hash: string; blockNumber: number }> {
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, signer);
  const contract = await factory.deploy(...args);
  const receipt = await contract.deploymentTransaction()?.wait();
  if (!receipt) {
    throw new Error("Missing deployment receipt");
  }

  return {
    contract,
    hash: receipt.hash,
    blockNumber: Number(receipt.blockNumber)
  };
}

async function sendAndWait(
  txPromise: Promise<ethers.ContractTransactionResponse>
): Promise<{ hash: string; blockNumber: number }> {
  const tx = await txPromise;
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("Missing transaction receipt");
  }

  return { hash: receipt.hash, blockNumber: Number(receipt.blockNumber) };
}

async function main(): Promise<void> {
  const profile = getProfile();
  const chain = loadJson<ChainConfig>(resolve(ROOT, "config", `chain.${profile}.json`));
  const params = loadJson<DeployParams>(resolve(ROOT, "deploy", `params.${profile}.json`));

  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required");
  }
  if (!chain.rpcUrl) {
    throw new Error(`config/chain.${profile}.json is missing rpcUrl`);
  }

  ensureFoundryBuild();

  const provider = new ethers.JsonRpcProvider(chain.rpcUrl, chain.chainId || undefined);
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const genesisTimestamp = Math.floor(Date.now() / 1000);

  const registryArtifact = loadArtifact("InferenceJobRegistry");
  const verifierArtifact = loadArtifact("ProofOfInferenceVerifier");
  const tokenArtifact = loadArtifact("KOINToken");
  const distributorArtifact = loadArtifact("RewardDistributor");

  const registry = await deployContract(deployer, registryArtifact, [deployer.address]);
  const verifier = await deployContract(deployer, verifierArtifact, [registry.contract.target]);
  const token = await deployContract(deployer, tokenArtifact, [deployer.address]);
  const distributor = await deployContract(deployer, distributorArtifact, [
    token.contract.target,
    registry.contract.target,
    verifier.contract.target,
    genesisTimestamp,
    params.epochDuration,
    params.halvingInterval,
    params.initialEpochEmission
  ]);

  const registryContract = new ethers.Contract(
    registry.contract.target,
    registryArtifact.abi,
    deployer
  );
  const tokenContract = new ethers.Contract(token.contract.target, tokenArtifact.abi, deployer);

  await sendAndWait(registryContract.setVerifier(verifier.contract.target));
  await sendAndWait(registryContract.setRewardDistributor(distributor.contract.target));
  await sendAndWait(tokenContract.setMinter(distributor.contract.target));
  await sendAndWait(registryContract.renounceAdmin());
  await sendAndWait(tokenContract.renounceAdmin());

  const manifest: Manifest = {
    contractAddresses: {
      registry: String(registry.contract.target),
      verifier: String(verifier.contract.target),
      token: String(token.contract.target),
      rewardDistributor: String(distributor.contract.target)
    },
    deployTxHashes: {
      registry: registry.hash,
      verifier: verifier.hash,
      token: token.hash,
      rewardDistributor: distributor.hash
    },
    blockNumbers: {
      registry: registry.blockNumber,
      verifier: verifier.blockNumber,
      token: token.blockNumber,
      rewardDistributor: distributor.blockNumber
    },
    chainId: await provider
      .getNetwork()
      .then((network) => Number(network.chainId)),
    epochParams: {
      genesisTimestamp,
      epochDuration: params.epochDuration,
      halvingInterval: params.halvingInterval,
      initialEpochEmission: params.initialEpochEmission
    },
    tokenCap: params.expectedTokenCap,
    gitRef: params.gitRef
  };

  const manifestPath = resolve(ROOT, "deployments", `worldland-${profile}.json`);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Deployment manifest written to ${manifestPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
