import { Contract, JsonRpcProvider, Wallet } from "ethers";
import type {
  DeploymentManifest,
  JobStateName,
  JobTypeName,
  OnChainJob,
  OnChainSubmission,
  VerificationRecord
} from "./types.js";

export const jobTypeToNumber: Record<JobTypeName, number> = {
  Simple: 0,
  General: 1,
  Collective: 2
};

export const jobStateNames: JobStateName[] = [
  "Created",
  "Open",
  "Submitted",
  "UnderVerification",
  "Accepted",
  "Rejected",
  "Settled",
  "Expired"
];

export function jobTypeNameFromValue(value: bigint): JobTypeName {
  if (value === 0n) {
    return "Simple";
  }
  if (value === 1n) {
    return "General";
  }
  return "Collective";
}

export function jobStateNameFromValue(value: bigint): JobStateName {
  return jobStateNames[Number(value)] ?? "Created";
}

const registryAbi = [
  "function totalJobs() view returns (uint256)",
  "function getJob(uint256 jobId) view returns ((uint256 jobId,address creator,bytes32 requestHash,bytes32 schemaHash,uint64 deadline,uint8 jobType,uint256 premiumReward,uint8 state))",
  "function getSubmission(uint256 jobId) view returns ((address provider,bytes32 responseHash,uint64 submittedAt,bool exists))",
  "function submitResponse(uint256 jobId, bytes32 responseHash)",
  "function markExpired(uint256 jobId)"
];

const verifierAbi = [
  "function registerSubmission(uint256 jobId)",
  "function verifySubmission(uint256 jobId)",
  "function rejectSubmission(uint256 jobId, string reason)",
  "function finalizePoI(uint256 jobId) returns (bytes32)",
  "function getRecord(uint256 jobId) view returns ((address provider,bytes32 responseHash,uint64 submittedAt,uint256 approvals,uint256 quorum,bool validJob,bool withinDeadline,bool formatPass,bool nonEmptyResponse,bool verificationPass,bool rejected,bool finalized,bytes32 poiHash))",
  "function hasParticipated(uint256 jobId, address verifier) view returns (bool)"
];

const rewardDistributorAbi = [
  "function distributeRewards(uint256 jobId, address provider)",
  "function rewardsDistributed(uint256 jobId) view returns (bool)"
];

const tokenAbi = [
  "function balanceOf(address owner) view returns (uint256)"
];

export interface KoinaraContracts {
  provider: JsonRpcProvider;
  wallet: Wallet;
  registry: Contract;
  verifier: Contract;
  rewardDistributor: Contract;
  token: Contract;
}

export function buildContracts(
  rpcUrl: string,
  chainId: number,
  walletPrivateKey: string,
  manifest: DeploymentManifest
): KoinaraContracts {
  const provider = new JsonRpcProvider(rpcUrl, chainId || undefined);
  const wallet = new Wallet(walletPrivateKey, provider);

  return {
    provider,
    wallet,
    registry: new Contract(manifest.contractAddresses.registry, registryAbi, wallet),
    verifier: new Contract(manifest.contractAddresses.verifier, verifierAbi, wallet),
    rewardDistributor: new Contract(
      manifest.contractAddresses.rewardDistributor,
      rewardDistributorAbi,
      wallet
    ),
    token: new Contract(manifest.contractAddresses.token, tokenAbi, wallet)
  };
}

export function rebuildContracts(
  provider: JsonRpcProvider,
  walletPrivateKey: string,
  manifest: DeploymentManifest
): KoinaraContracts {
  const wallet = new Wallet(walletPrivateKey, provider);

  return {
    provider,
    wallet,
    registry: new Contract(manifest.contractAddresses.registry, registryAbi, wallet),
    verifier: new Contract(manifest.contractAddresses.verifier, verifierAbi, wallet),
    rewardDistributor: new Contract(
      manifest.contractAddresses.rewardDistributor,
      rewardDistributorAbi,
      wallet
    ),
    token: new Contract(manifest.contractAddresses.token, tokenAbi, wallet)
  };
}

export function asJob(job: OnChainJob): OnChainJob {
  return job;
}

export function asSubmission(submission: OnChainSubmission): OnChainSubmission {
  return submission;
}

export function asRecord(record: VerificationRecord): VerificationRecord {
  return record;
}
