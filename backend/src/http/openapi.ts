/**
 * OpenAPI document for the HTTP API.
 *
 * Responsibility: single source of truth for the route catalogue served at
 * GET /openapi.json. Update this file in the same commit as any route
 * change — the frontend treats it as the API contract.
 */
export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.0.3",
    info: {
      title: "Craftland Quality Analyzer",
      version: "2.2.0",
    },
    paths: {
      "/api/health": { get: { summary: "Service health" } },
      "/api/projects/inspect": { post: { summary: "Inspect a local Git project" } },
      "/api/projects/browse": { get: { summary: "Browse allowed directories for project selection" } },
      "/api/projects/branches": { get: { summary: "List branches of a local Git project" } },
      "/api/projects/commits": { get: { summary: "Search commits of a local Git project" } },
      "/api/projects/diff": { post: { summary: "Preview the file diff between two refs without running AI" } },
      "/api/projects/whatif": { post: { summary: "Evaluate a hypothetical single-cell config edit" } },
      "/api/projects/write": { post: { summary: "Draft a commit message or PR description for a ref pair" } },
      "/api/projects/localization": { post: { summary: "Check or translate localization tables for one revision" } },
      "/api/projects/localization/ask": { post: { summary: "Ask a QA question about one localization table" } },
      "/api/analysis-runs": {
        post: { summary: "Start an analysis run" },
        get: { summary: "List analysis runs" },
      },
      "/api/analysis-runs/compare": {
        post: { summary: "Compare two completed analysis runs" },
      },
      "/api/analysis-runs/{id}": { get: { summary: "Get an analysis run" } },
      "/api/analysis-runs/{id}/questions": {
        post: { summary: "Ask a follow-up question about a completed run" },
        get: { summary: "List follow-up questions for a run" },
      },
      "/api/analysis-runs/import": {
        post: { summary: "Import an analysis run from exported JSON" },
      },
    },
  };
}
