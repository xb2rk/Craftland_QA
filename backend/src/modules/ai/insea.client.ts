import { openAsBlob } from "node:fs";
import { z } from "zod";

import { AIProtocolError } from "../../shared/errors.js";
import { getLogger } from "../../shared/logger.js";
import type { WorkflowRunInput } from "./context-builder.js";

export interface InseaClientOptions {
  url: string;
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

const workflowResultSchema = z.record(z.string(), z.unknown());

export class InseaWorkflowClient {
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: InseaClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async run(input: WorkflowRunInput): Promise<Record<string, unknown>> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.runOnce(input);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === this.maxRetries) throw error;
        const backoffMs = 500 * 2 ** attempt;
        getLogger().warn(
          { requestId: input.requestId, attempt, backoffMs },
          "Insea request retryable, backing off",
        );
        await delay(backoffMs);
      }
    }
    throw lastError;
  }

  private async runOnce(
    input: WorkflowRunInput,
  ): Promise<Record<string, unknown>> {
    const form = new FormData();
    form.append("Prompt", input.prompt);
    form.append("Manifest", JSON.stringify(input.manifest));
    for (const file of input.files) {
      const blob = await openAsBlob(file.absolutePath, {
        type: file.contentType,
      });
      form.append("DataList", blob, file.uploadName);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.options.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
        body: form,
        signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) {
        throw Object.assign(new Error(`Insea transport failed: ${response.status}`), {
          status: response.status,
          retryable: true,
        });
      }
      if (!response.ok) {
        throw new AIProtocolError(
          `Insea request failed with status ${response.status}.`,
        );
      }
      const data: unknown = await response.json();
      const resultText = readWorkflowResult(data);
      const parsed = parseJsonResult(resultText);
      const validated = workflowResultSchema.safeParse(parsed);
      if (!validated.success) {
        throw new AIProtocolError(
          `Workflow result must be one JSON object: ${validated.error.message}`,
        );
      }
      const manifestStage = (input.manifest as Record<string, unknown>).stage;
      return {
        ...validated.data,
        schema_version:
          typeof validated.data.schema_version === "string"
            ? validated.data.schema_version
            : "1.0",
        stage:
          typeof validated.data.stage === "string"
            ? validated.data.stage
            : typeof manifestStage === "string"
              ? manifestStage
              : "impact_analysis",
        status:
          typeof validated.data.status === "string"
            ? validated.data.status
            : "completed",
      };
    } catch (error) {
      if (error instanceof AIProtocolError) throw error;
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw Object.assign(new Error("Insea request timed out."), {
          retryable: true,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AIProtocolError) return false;
  if (typeof error === "object" && error !== null && "retryable" in error) {
    return (error as { retryable?: boolean }).retryable === true;
  }
  if (error instanceof TypeError) return true;
  return false;
}

function readWorkflowResult(response: unknown): string {
  const parsed = z
    .object({
      data: z.object({
        status: z.literal("succeeded"),
        outputs: z.object({ result: z.string() }),
      }),
    })
    .safeParse(response);
  if (!parsed.success) {
    throw new AIProtocolError(
      "Insea response is missing data.status=succeeded or data.outputs.result.",
    );
  }
  return parsed.data.data.outputs.result;
}

function parseJsonResult(result: string): unknown {
  const trimmed = result.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new AIProtocolError(
      "Insea data.outputs.result must contain exactly one JSON object.",
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
