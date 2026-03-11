export type NodeRole = "provider" | "verifier" | "both";
export type ChainProfileName = "testnet" | "mainnet";
export type JobTypeName = "Simple" | "General" | "Collective";
export type JobStateName =
  | "Created"
  | "Open"
  | "Submitted"
  | "UnderVerification"
  | "Accepted"
  | "Rejected"
  | "Settled"
  | "Expired";
export type InferenceBackendName = "ollama" | "openai";

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  backupRpcUrls: string[];
  explorerBaseUrl: string;
  confirmationsRequired: number;
  nativeToken: {
    type: string;
    symbol: string;
    address?: string;
  };
}

export interface DeploymentManifest {
  contractAddresses: {
    registry: string;
    verifier: string;
    token: string;
    rewardDistributor: string;
  };
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
}

export interface FileNodeConfig {
  chainProfile: ChainProfileName;
  deploymentManifestPath: string;
  pollIntervalMs: number;
  manifestRoots: string[];
  receiptRoots: string[];
  artifactOutputDir: string;
  provider?: {
    backend: InferenceBackendName;
    supportedJobTypes: JobTypeName[];
    ollama?: {
      baseUrl: string;
      model: string;
    };
    openai?: {
      model: string;
      baseUrl?: string;
    };
  };
  verifier?: {
    supportedJobTypes: JobTypeName[];
    supportedSchemaHashes: string[];
  };
}

export interface RuntimeConfig {
  packageRoot: string;
  rootDir: string;
  role: NodeRole;
  walletPrivateKey: string;
  walletSource: "env" | "keyfile";
  chainProfile: ChainProfileName;
  chain: ChainConfig;
  deploymentManifest: DeploymentManifest;
  pollIntervalMs: number;
  manifestRoots: string[];
  receiptRoots: string[];
  artifactOutputDir: string;
  rpcCandidates: string[];
  selectedRpcUrl?: string;
  provider?: FileNodeConfig["provider"];
  verifier?: FileNodeConfig["verifier"];
  openAiApiKey?: string;
}

export interface JobManifest {
  version: "koinara-job-manifest-v1";
  requestHash: string;
  body: {
    prompt: string;
    contentType: string;
    schema: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
}

export interface SubmissionReceipt {
  version: "koinara-submission-receipt-v1";
  jobId: number;
  responseHash: string;
  provider: string;
  body: {
    contentType: string;
    output: unknown;
    metadata: Record<string, unknown>;
  };
}

export interface OnChainJob {
  jobId: bigint;
  creator: string;
  requestHash: string;
  schemaHash: string;
  deadline: bigint;
  jobType: bigint;
  premiumReward: bigint;
  state: bigint;
}

export interface OnChainSubmission {
  provider: string;
  responseHash: string;
  submittedAt: bigint;
  exists: boolean;
}

export interface VerificationRecord {
  provider: string;
  responseHash: string;
  submittedAt: bigint;
  approvals: bigint;
  quorum: bigint;
  validJob: boolean;
  withinDeadline: boolean;
  formatPass: boolean;
  nonEmptyResponse: boolean;
  verificationPass: boolean;
  rejected: boolean;
  finalized: boolean;
  poiHash: string;
}

export interface StoredNodeState {
  provider: {
    submittedJobs: Record<string, string>;
  };
  verifier: {
    participatedJobs: Record<string, string>;
  };
}
