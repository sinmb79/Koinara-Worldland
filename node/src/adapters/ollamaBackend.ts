import type { JobManifest } from "../types.js";
import type { InferenceBackend, InferenceResult } from "./inference.js";

export class OllamaBackend implements InferenceBackend {
  readonly name = "ollama";

  constructor(
    private readonly baseUrl: string,
    private readonly model: string
  ) {}

  async infer(manifest: JobManifest): Promise<InferenceResult> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        prompt: manifest.body.prompt,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { response?: string };
    return {
      contentType: "application/json",
      output: {
        text: payload.response ?? ""
      },
      metadata: {
        backend: "ollama",
        model: this.model
      }
    };
  }
}
