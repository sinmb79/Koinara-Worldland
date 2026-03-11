import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildContracts } from "./contracts.js";
import { loadRuntimeConfig } from "./config.js";
import { resolveHealthyRpcUrl } from "./rpc.js";
import { runProviderPass } from "./runtime/providerRunner.js";
import { runVerifierPass } from "./runtime/verifierRunner.js";
import { FileStateStore } from "./state/fileStateStore.js";

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const selectedRpcUrl = await resolveHealthyRpcUrl(config.rpcCandidates, config.chain.chainId);
  const contracts = buildContracts(
    selectedRpcUrl,
    config.chain.chainId,
    config.walletPrivateKey,
    config.deploymentManifest
  );
  const statePath = resolve(config.packageRoot, ".koinara-worldland", "state.json");
  mkdirSync(resolve(config.packageRoot, ".koinara-worldland"), { recursive: true });
  const stateStore = new FileStateStore(statePath);
  const runOnce = process.argv.includes("--once") || process.env.NODE_RUN_ONCE === "1";

  console.log(`Starting Koinara node as ${config.role}`);
  console.log(`Wallet: ${contracts.wallet.address}`);
  console.log(`RPC: ${selectedRpcUrl}`);
  console.log(`Wallet source: ${config.walletSource}`);

  if (runOnce) {
    await runPasses(config.role, config.pollIntervalMs, config, contracts, stateStore, true);
    return;
  }

  await runPasses(config.role, config.pollIntervalMs, config, contracts, stateStore, false);
}

async function runPasses(
  role: string,
  intervalMs: number,
  config: Parameters<typeof runProviderPass>[0],
  contracts: Parameters<typeof runProviderPass>[1],
  stateStore: FileStateStore,
  once: boolean
): Promise<void> {
  const tasks: Array<Promise<void>> = [];

  if (role === "provider" || role === "both") {
    tasks.push(loop("provider", intervalMs, () => runProviderPass(config, contracts, stateStore), once));
  }
  if (role === "verifier" || role === "both") {
    tasks.push(loop("verifier", intervalMs, () => runVerifierPass(config, contracts, stateStore), once));
  }

  await Promise.all(tasks);
}

async function loop(
  label: string,
  intervalMs: number,
  fn: () => Promise<void>,
  once: boolean
): Promise<void> {
  do {
    try {
      await fn();
    } catch (error) {
      console.error(`${label}: pass failed`, error);
    }
    if (once) {
      break;
    }
    await sleep(intervalMs);
  } while (!once);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

void main();
