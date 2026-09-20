import { createReadStream } from "node:fs";

import axios from "axios";
import FormData from "form-data";
import { z } from "zod";

export interface WorkflowFile {
  absolutePath: string;
  uploadName: string;
  contentType: string;
}

export interface WorkflowRunInput {
  prompt: string;
  manifest: Record<string, unknown>;
  files: WorkflowFile[];
}

export interface MultipartRequest {
  url: string;
  apiKey: string;
  fields: {
    Prompt: string;
    Manifest: string;
  };
  files: Array<
    WorkflowFile & {
      fieldName: "DataList";
    }
  >;
}

export type MultipartTransport = (
  request: MultipartRequest
) => Promise<unknown>;

export interface InseaWorkflowClientOptions {
  url: string;
  apiKey: string;
  timeoutMs?: number;
  postMultipart?: MultipartTransport;
}

const workflowResultSchema = z.record(z.string(), z.unknown());

export class WorkflowProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowProtocolError";
  }
}

export class InseaWorkflowClient {
  private readonly postMultipart: MultipartTransport;

  constructor(private readonly options: InseaWorkflowClientOptions) {
    this.postMultipart =
      options.postMultipart ??
      createAxiosMultipartTransport(options.timeoutMs ?? 180_000);
  }

  async run(input: WorkflowRunInput): Promise<Record<string, unknown>> {
    const response = await this.postMultipart({
      url: this.options.url,
      apiKey: this.options.apiKey,
      fields: {
        Prompt: input.prompt,
        Manifest: JSON.stringify(input.manifest)
      },
      files: input.files.map((file) => ({
        ...file,
        fieldName: "DataList"
      }))
    });

    const resultText = readWorkflowResult(response);
    const parsed = parseJsonResult(resultText);
    const validated = workflowResultSchema.safeParse(parsed);
    if (!validated.success) {
      throw new WorkflowProtocolError(
        `Workflow result must be one JSON object: ${validated.error.message}`
      );
    }

    const manifestStage = input.manifest.stage;
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
          : "completed"
    };
  }
}

function createAxiosMultipartTransport(timeoutMs: number): MultipartTransport {
  return async (request) => {
    const form = new FormData();
    form.append("Prompt", request.fields.Prompt);
    form.append("Manifest", request.fields.Manifest);
    for (const file of request.files) {
      form.append(file.fieldName, createReadStream(file.absolutePath), {
        filename: file.uploadName,
        contentType: file.contentType
      });
    }

    const response = await axios.post(request.url, form, {
      timeout: timeoutMs,
      maxBodyLength: 100 * 1024 * 1024,
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${request.apiKey}`
      }
    });
    return response.data;
  };
}

function readWorkflowResult(response: unknown): string {
  const parsed = z
    .object({
      data: z.object({
        status: z.literal("succeeded"),
        outputs: z.object({
          result: z.string()
        })
      })
    })
    .safeParse(response);

  if (!parsed.success) {
    throw new WorkflowProtocolError(
      "Insea response is missing data.status=succeeded or data.outputs.result."
    );
  }
  return parsed.data.data.outputs.result;
}

function parseJsonResult(result: string): unknown {
  const trimmed = result.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(withoutFence);
  } catch {
    throw new WorkflowProtocolError(
      "Insea data.outputs.result must contain exactly one JSON object."
    );
  }
}
