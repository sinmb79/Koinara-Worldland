import type { FileNodeConfig, JobManifest } from "../types.js";
import { OllamaBackend } from "./ollamaBackend.js";
import { OpenAIBackend } from "./openaiBackend.js";

export interface InferenceResult {
  contentType: string;
  output: unknown;
  metadata: Record<string, unknown>;
}

export interface InferenceBackend {
  readonly name: string;
  infer(manifest: JobManifest): Promise<InferenceResult>;
}

export function createInferenceBackend(
  providerConfig: NonNullable<FileNodeConfig["provider"]>,
  openAiApiKey?: string
): InferenceBackend {
  if (providerConfig.backend === "ollama") {
    if (!providerConfig.ollama) {
      throw new Error("Ollama backend requires provider.ollama configuration");
    }
    return new OllamaBackend(providerConfig.ollama.baseUrl, providerConfig.ollama.model);
  }

  if (!providerConfig.openai) {
    throw new Error("OpenAI backend requires provider.openai configuration");
  }
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required for the OpenAI backend");
  }

  return new OpenAIBackend(
    openAiApiKey,
    providerConfig.openai.model,
    providerConfig.openai.baseUrl
  );
}
