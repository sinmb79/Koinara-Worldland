import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveHealthyRpcUrl } from "./rpc.js";
import { loadRuntimeConfig } from "./config.js";

async function main(): Promise<void> {
  const warnings: string[] = [];
  const failures: string[] = [];

  let config;
  try {
    config = loadRuntimeConfig({ allowMissingWallet: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Configuration load failed: ${message}`);
    process.exitCode = 1;
    return;
  }

  if (!existsSync(config.artifactOutputDir)) {
    warnings.push(`artifactOutputDir does not exist yet: ${config.artifactOutputDir}`);
  }
  if (!existsSync(resolve(config.packageRoot, "node.config.json"))) {
    failures.push("node.config.json is missing");
  }
  if (!existsSync(resolve(config.packageRoot, "..", "deployments", `worldland-${config.chainProfile}.json`))) {
    warnings.push(`deployment manifest for ${config.chainProfile} is missing`);
  }

  if ((config.role === "provider" || config.role === "both") && !config.provider) {
    failures.push("provider role is enabled but provider config is missing");
  }
  if ((config.role === "verifier" || config.role === "both") && !config.verifier) {
    failures.push("verifier role is enabled but verifier config is missing");
  }
  if (!config.walletPrivateKey) {
    warnings.push("wallet is not configured yet; set WALLET_PRIVATE_KEY or WALLET_KEYFILE before running the node");
  }
  if (config.provider?.backend === "openai" && !config.openAiApiKey) {
    warnings.push("provider backend is openai but OPENAI_API_KEY is not set");
  }

  if (config.rpcCandidates.length === 0) {
    failures.push("no RPC candidates are configured");
  } else {
    try {
      const rpcUrl = await resolveHealthyRpcUrl(config.rpcCandidates, config.chain.chainId);
      console.log(`Healthy RPC: ${rpcUrl}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  console.log(`Role: ${config.role}`);
  console.log(`Chain profile: ${config.chainProfile}`);
  console.log(`Wallet source: ${config.walletSource}`);

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    warnings.forEach((entry) => console.log(`- ${entry}`));
  }

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((entry) => console.log(`- ${entry}`));
    process.exitCode = 1;
    return;
  }

  console.log("\nNode doctor found no blocking issues.");
}

void main();
