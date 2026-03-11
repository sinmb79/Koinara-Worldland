import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

type ChainConfig = {
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
};

const repoRoot = process.cwd();
const checkedFiles = execFileSync("git", ["ls-files"], {
  cwd: repoRoot,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => {
    const ext = path.extname(file).toLowerCase();
    const basename = path.basename(file).toLowerCase();
    return (
      [
        ".md",
        ".json",
        ".ts",
        ".sol",
        ".yml",
        ".yaml",
        ".toml",
        ".css",
        ".html",
      ].includes(ext) ||
      [".gitignore", ".gitmodules"].includes(basename)
    );
  });

const errors: string[] = [];

function parseJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(path.join(repoRoot, filePath), "utf8")) as T;
}

function expect(condition: boolean, message: string) {
  if (!condition) {
    errors.push(message);
  }
}

function validateChainConfig(filePath: string) {
  const config = parseJsonFile<ChainConfig>(filePath);
  expect(Number.isInteger(config.chainId), `${filePath}: chainId must be an integer`);
  expect(typeof config.rpcUrl === "string", `${filePath}: rpcUrl must be a string`);
  expect(Array.isArray(config.backupRpcUrls), `${filePath}: backupRpcUrls must be an array`);
  expect(
    Number.isInteger(config.confirmationsRequired) && config.confirmationsRequired >= 1,
    `${filePath}: confirmationsRequired must be >= 1`,
  );
  expect(typeof config.nativeToken?.type === "string", `${filePath}: nativeToken.type is required`);
  expect(typeof config.nativeToken?.symbol === "string", `${filePath}: nativeToken.symbol is required`);

  if (config.nativeToken?.type === "erc20") {
    expect(
      typeof config.nativeToken.address === "string",
      `${filePath}: nativeToken.address must exist for erc20 tokens`,
    );
  }
}

function validateTrackedText(filePath: string) {
  const contents = readFileSync(path.join(repoRoot, filePath), "utf8");
  const ext = path.extname(filePath).toLowerCase();

  const bannedPatterns = [
    { pattern: /D:\\/i, message: "contains a Windows absolute path" },
    { pattern: /C:\\Users\\/i, message: "contains a user-specific Windows path" },
    { pattern: /\/Users\//, message: "contains a macOS user path" },
  ];

  for (const { pattern, message } of bannedPatterns) {
    if (pattern.test(contents)) {
      errors.push(`${filePath}: ${message}`);
    }
  }

  const secretFileExtensions = new Set([
    ".env",
    ".json",
    ".md",
    ".txt",
    ".toml",
    ".yml",
    ".yaml",
    ".example",
  ]);

  if (secretFileExtensions.has(ext) || filePath.includes(".env")) {
    const secretPatterns = [
      { pattern: /PRIVATE_KEY\s*=\s*['"]?(?!["']?$)/, message: "contains an inline private key assignment" },
      { pattern: /WALLET_PRIVATE_KEY\s*=\s*['"]?(?!["']?$)/, message: "contains an inline wallet private key assignment" },
      { pattern: /OPENAI_API_KEY\s*=\s*['"]?(?!["']?$)/, message: "contains an inline OpenAI API key assignment" },
    ];

    for (const { pattern, message } of secretPatterns) {
      if (pattern.test(contents)) {
        errors.push(`${filePath}: ${message}`);
      }
    }
  }
}

validateChainConfig("config/chain.testnet.json");
validateChainConfig("config/chain.mainnet.json");

for (const filePath of checkedFiles) {
  validateTrackedText(filePath);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`CI sanity check failed: ${error}`);
  }
  process.exit(1);
}

console.log(`CI sanity checks passed for ${checkedFiles.length} tracked text files.`);
