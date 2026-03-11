import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { resolve } from "node:path";
import process from "node:process";
import "dotenv/config";
import {
  ROOT,
  getProfileFromArgv,
  hasForgeInstalled,
  isPlaceholderConfig,
  loadChainConfig,
  loadDeployParams,
  resolveChainConfigPath
} from "./common.js";

async function main(): Promise<void> {
  const profile = getProfileFromArgv();
  const chain = loadChainConfig(profile);
  const params = loadDeployParams(profile);

  const failures: string[] = [];
  const warnings: string[] = [];

  if (!hasForgeInstalled()) {
    warnings.push("forge is not installed or is blocked in this environment");
  }

  failures.push(...isPlaceholderConfig(chain));

  if (params.epochDuration <= 0) {
    failures.push("epochDuration must be positive");
  }
  if (params.halvingInterval <= 0) {
    failures.push("halvingInterval must be positive");
  }
  if (!params.initialEpochEmission || params.initialEpochEmission === "0") {
    failures.push("initialEpochEmission must be non-zero");
  }
  if (!params.expectedTokenCap || params.expectedTokenCap === "0") {
    failures.push("expectedTokenCap must be non-zero");
  }
  if (params.gitRef !== "v0.1.6") {
    warnings.push(`gitRef is ${params.gitRef}; expected v0.1.6`);
  }

  const submoduleHeadPath = resolve(ROOT, ".gitmodules");
  if (!existsSync(submoduleHeadPath)) {
    failures.push(".gitmodules is missing");
  } else {
    const gitmodules = readFileSync(submoduleHeadPath, "utf8");
    if (!gitmodules.includes("vendor/koinara")) {
      failures.push("vendor/koinara submodule is not configured");
    }
  }

  const vendorReadmePath = resolve(ROOT, "vendor", "koinara", "README.md");
  if (!existsSync(vendorReadmePath)) {
    failures.push("vendor/koinara is not initialized. Run git submodule update --init --recursive");
  }

  const deployManifestPath = resolve(ROOT, "deployments", `worldland-${profile}.json`);
  if (!existsSync(deployManifestPath)) {
    warnings.push(`No deployment manifest yet at deployments/worldland-${profile}.json`);
  }

  if (!process.env.PRIVATE_KEY && !process.env.PRIVATE_KEY_FILE) {
    warnings.push("PRIVATE_KEY or PRIVATE_KEY_FILE is not set; deploy commands will not run yet");
  }

  console.log(`Koinara-Worldland doctor for ${profile}`);
  console.log(`Config file: ${relative(ROOT, resolveChainConfigPath(profile))}`);
  console.log(`Params file: deploy/params.${profile}.json`);

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

  console.log("\nNo blocking issues found.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
