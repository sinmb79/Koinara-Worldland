import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileNodeConfig, JobTypeName, NodeRole } from "./types.js";

async function main(): Promise<void> {
  const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const rl = createInterface({ input, output });

  try {
    const role = (await ask(rl, "Select role (provider/verifier/both)", "provider")) as NodeRole;
    const chainProfile = await ask(rl, "Select chain profile (testnet/mainnet)", "testnet");
    const deploymentManifestPath = await ask(
      rl,
      "Path to deployment manifest, relative to node/",
      chainProfile === "mainnet"
        ? "../deployments/worldland-mainnet.json"
        : "../deployments/worldland-testnet.json"
    );
    const sharedRoot = await ask(
      rl,
      "Shared manifest and receipt root, relative to node/",
      "./.koinara-worldland/network"
    );
    const artifactOutputDir = await ask(
      rl,
      "Artifact output directory, relative to node/",
      "./.koinara-worldland/artifacts"
    );
    const pollIntervalMs = Number(await ask(rl, "Polling interval in milliseconds", "10000"));
    const privateKeyOrPath = await ask(rl, "Wallet private key or path to key file", "");
    const privateKey = privateKeyOrPath.startsWith("0x")
      ? privateKeyOrPath
      : readFileSync(resolve(packageRoot, privateKeyOrPath), "utf8").trim();

    let providerConfig: FileNodeConfig["provider"] | undefined;
    if (role === "provider" || role === "both") {
      const backend = await ask(rl, "Provider backend (ollama/openai)", "ollama");
      if (backend === "ollama") {
        providerConfig = {
          backend: "ollama",
          supportedJobTypes: ["Simple"],
          ollama: {
            baseUrl: await ask(rl, "Ollama base URL", "http://127.0.0.1:11434"),
            model: await ask(rl, "Ollama model", "llama3.1")
          }
        };
      } else {
        providerConfig = {
          backend: "openai",
          supportedJobTypes: await askJobTypes(rl, ["General"]),
          openai: {
            model: await ask(rl, "OpenAI model", "gpt-4.1-mini")
          }
        };
      }
    }

    let verifierConfig: FileNodeConfig["verifier"] | undefined;
    if (role === "verifier" || role === "both") {
      verifierConfig = {
        supportedJobTypes: await askJobTypes(rl, ["Simple", "General", "Collective"]),
        supportedSchemaHashes: []
      };
    }

    const fileConfig: FileNodeConfig = {
      chainProfile: chainProfile === "mainnet" ? "mainnet" : "testnet",
      deploymentManifestPath,
      pollIntervalMs,
      manifestRoots: [sharedRoot],
      receiptRoots: [sharedRoot],
      artifactOutputDir,
      provider: providerConfig,
      verifier: verifierConfig
    };

    writeJson(resolve(packageRoot, "node.config.json"), fileConfig);
    writeEnv(resolve(packageRoot, ".env.local"), {
      WALLET_PRIVATE_KEY: privateKey,
      NODE_ROLE: role,
      OPENAI_API_KEY: providerConfig?.backend === "openai" ? "" : undefined
    });

    const runtimeDirs = [sharedRoot, artifactOutputDir].map((entry) => resolve(packageRoot, entry));
    runtimeDirs.forEach((dir) => mkdirSync(dir, { recursive: true }));

    console.log("Wrote node/node.config.json and node/.env.local");
    console.log("You can now run: npm run node");
  } finally {
    rl.close();
  }
}

async function ask(
  rl: ReturnType<typeof createInterface>,
  question: string,
  fallback: string
): Promise<string> {
  const answer = (await rl.question(`${question} [${fallback}]: `)).trim();
  return answer || fallback;
}

async function askJobTypes(
  rl: ReturnType<typeof createInterface>,
  fallback: JobTypeName[]
): Promise<JobTypeName[]> {
  const answer = await ask(
    rl,
    "Supported job types (comma-separated: Simple,General,Collective)",
    fallback.join(",")
  );

  return answer
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) as JobTypeName[];
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeEnv(path: string, values: Record<string, string | undefined>): void {
  const lines = Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value ?? ""}`);
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

void main();
