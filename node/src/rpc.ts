import { JsonRpcProvider } from "ethers";
import type { ChainConfig } from "./types.js";

export function getRpcCandidates(chain: ChainConfig, override?: string): string[] {
  const candidates = [override, chain.rpcUrl, ...(chain.backupRpcUrls ?? [])]
    .filter((entry): entry is string => Boolean(entry && entry.trim()))
    .map((entry) => entry.trim());

  return [...new Set(candidates)];
}

export async function resolveHealthyRpcUrl(
  candidates: string[],
  expectedChainId = 0
): Promise<string> {
  if (candidates.length === 0) {
    throw new Error("No RPC candidates configured");
  }

  let lastError = "No RPC candidate was tried";
  for (const rpcUrl of candidates) {
    try {
      const provider = new JsonRpcProvider(rpcUrl, expectedChainId || undefined);
      const network = await provider.getNetwork();
      if (expectedChainId && Number(network.chainId) !== expectedChainId) {
        throw new Error(`wrong chainId ${network.chainId}`);
      }
      return rpcUrl;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`Unable to connect to any configured RPC endpoint. Last error: ${lastError}`);
}
