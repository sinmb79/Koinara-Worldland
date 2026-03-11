import type { JobManifest } from "../types.js";
import type { InferenceBackend, InferenceResult } from "./inference.js";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
};

export class OpenAIBackend implements InferenceBackend {
  readonly name = "openai";
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    baseUrl = "https://api.openai.com/v1"
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async infer(manifest: JobManifest): Promise<InferenceResult> {
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: manifest.body.prompt
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI request failed with ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as OpenAIResponse;
    const text =
      payload.output_text ??
      payload.output?.flatMap((item) => item.content ?? []).map((entry) => entry.text ?? "").join("") ??
      "";

    return {
      contentType: "application/json",
      output: {
        text
      },
      metadata: {
        backend: "openai",
        model: this.model
      }
    };
  }
}
