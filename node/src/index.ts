import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildContracts } from "./contracts.js";
import { loadRuntimeConfig } from "./config.js";
import { runProviderPass } from "./runtime/providerRunner.js";
import { runVerifierPass } from "./runtime/verifierRunner.js";
import { FileStateStore } from "./state/fileStateStore.js";

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const contracts = buildContracts(
    config.chain.rpcUrl,
    config.chain.chainId,
    config.walletPrivateKey,
    config.deploymentManifest
  );
  const statePath = resolve(config.packageRoot, ".koinara-worldland", "state.json");
  mkdirSync(resolve(config.packageRoot, ".koinara-worldland"), { recursive: true });
  const stateStore = new FileStateStore(statePath);

  console.log(`Starting Koinara node as ${config.role}`);
  console.log(`Wallet: ${contracts.wallet.address}`);
  console.log(`RPC: ${config.chain.rpcUrl}`);

  const tasks: Array<Promise<void>> = [];
  if (config.role === "provider" || config.role === "both") {
    tasks.push(loop("provider", config.pollIntervalMs, () => runProviderPass(config, contracts, stateStore)));
  }
  if (config.role === "verifier" || config.role === "both") {
    tasks.push(loop("verifier", config.pollIntervalMs, () => runVerifierPass(config, contracts, stateStore)));
  }

  await Promise.all(tasks);
}

async function loop(
  label: string,
  intervalMs: number,
  fn: () => Promise<void>
): Promise<void> {
  for (;;) {
    try {
      await fn();
    } catch (error) {
      console.error(`${label}: pass failed`, error);
    }
    await sleep(intervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

void main();
