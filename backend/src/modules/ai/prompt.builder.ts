/**
 * Prompt builder barrel.
 *
 * Responsibility: preserve the historical import path
 * (`../ai/prompt.builder.js`) while the implementations live in
 * per-stage modules under ./prompts. New code should import from the
 * stage module directly; this barrel exists for backward compatibility.
 */
export type { AiStage } from "./prompts/shared.js";
export { AI_PROMPT_VERSION } from "./prompts/shared.js";
export { buildPrompt } from "./prompts/review.prompt.js";
export {
  buildFollowupPrompt,
  type FollowupPromptInput,
} from "./prompts/followup.prompt.js";
export {
  buildWhatIfPrompt,
  type WhatIfPromptInput,
} from "./prompts/whatif.prompt.js";
export {
  buildWriterPrompt,
  type BuildWriterPromptInput,
  type WriterDigestFile,
  type WriterKind,
} from "./prompts/writer.prompt.js";
