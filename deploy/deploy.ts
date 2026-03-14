import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { ethers } from "ethers";
import "dotenv/config";
import {
  ROOT,
  ensureFoundryBuild,
  getProfileFromArgv,
  getRpcCandidates,
  loadChainConfig,
  loadDeployParams,
  loadPrivateKeyFromEnv,
  loadTxOverridesFromEnv,
  resolveHealthyRpcUrl
} from "./common.js";

type Artifact = {
  abi: ethers.InterfaceAbi;
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

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadArtifact(name: string): Artifact {
  const artifactPath = resolve(ROOT, "out", `${name}.sol`, `${name}.json`);
  return loadJson<Artifact>(artifactPath);
}

async function deployContract(
  signer: ethers.Signer,
  artifact: Artifact,
  confirmationsRequired: number,
  args: unknown[] = [],
  txOverrides: ethers.Overrides = {}
): Promise<{ contract: ethers.BaseContract; hash: string; blockNumber: number }> {
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, signer);
  const contract = await factory.deploy(...args, txOverrides);
  const receipt = await contract.deploymentTransaction()?.wait(confirmationsRequired);
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
  txPromise: Promise<ethers.ContractTransactionResponse>,
  confirmationsRequired: number
): Promise<{ hash: string; blockNumber: number }> {
  const tx = await txPromise;
  const receipt = await tx.wait(confirmationsRequired);
  if (!receipt) {
    throw new Error("Missing transaction receipt");
  }

  return { hash: receipt.hash, blockNumber: Number(receipt.blockNumber) };
}

async function main(): Promise<void> {
  const profile = getProfileFromArgv();
  const chain = loadChainConfig(profile);
  const params = loadDeployParams(profile);
  const { privateKey } = loadPrivateKeyFromEnv("PRIVATE_KEY", "PRIVATE_KEY_FILE");

  ensureFoundryBuild();

  const rpcUrl = await resolveHealthyRpcUrl(getRpcCandidates(chain), chain.chainId);
  const provider = new ethers.JsonRpcProvider(rpcUrl, chain.chainId || undefined);
  const deployerWallet = new ethers.Wallet(privateKey, provider);
  const deployer = new ethers.NonceManager(deployerWallet);
  const txOverrides = loadTxOverridesFromEnv();
  const genesisTimestamp =
    process.env.GENESIS_TIMESTAMP && process.env.GENESIS_TIMESTAMP.trim()
      ? Number(process.env.GENESIS_TIMESTAMP)
      : Math.floor(Date.now() / 1000);
  if (!Number.isInteger(genesisTimestamp) || genesisTimestamp > Math.floor(Date.now() / 1000)) {
    throw new Error("GENESIS_TIMESTAMP must be an integer that is not in the future");
  }

  const registryArtifact = loadArtifact("InferenceJobRegistry");
  const verifierArtifact = loadArtifact("ProofOfInferenceVerifier");
  const tokenArtifact = loadArtifact("KOINToken");
  const distributorArtifact = loadArtifact("RewardDistributor");

  const registry = await deployContract(deployer, registryArtifact, chain.confirmationsRequired, [
    deployerWallet.address
  ], txOverrides);
  const verifier = await deployContract(
    deployer,
    verifierArtifact,
    chain.confirmationsRequired,
    [registry.contract.target],
    txOverrides
  );
  const token = await deployContract(deployer, tokenArtifact, chain.confirmationsRequired, [
    deployerWallet.address
  ], txOverrides);
  const distributor = await deployContract(
    deployer,
    distributorArtifact,
    chain.confirmationsRequired,
    [
    token.contract.target,
    registry.contract.target,
    verifier.contract.target,
    genesisTimestamp,
    params.epochDuration,
    params.halvingInterval,
    params.initialEpochEmission
    ],
    txOverrides
  );

  const registryContract = new ethers.Contract(
    registry.contract.target,
    registryArtifact.abi,
    deployer
  );
  const tokenContract = new ethers.Contract(token.contract.target, tokenArtifact.abi, deployer);

  await sendAndWait(
    registryContract.setVerifier(verifier.contract.target, txOverrides),
    chain.confirmationsRequired
  );
  await sendAndWait(
    registryContract.setRewardDistributor(distributor.contract.target, txOverrides),
    chain.confirmationsRequired
  );
  await sendAndWait(
    tokenContract.setMinter(distributor.contract.target, txOverrides),
    chain.confirmationsRequired
  );
  await sendAndWait(registryContract.renounceAdmin(txOverrides), chain.confirmationsRequired);
  await sendAndWait(tokenContract.renounceAdmin(txOverrides), chain.confirmationsRequired);

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
