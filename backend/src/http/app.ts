import cors from "cors";
import express from "express";
import helmet from "helmet";

import type { AppConfig } from "../config/env.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.js";
import { asyncRoute } from "../shared/async-handler.js";
import { NotFoundError } from "../shared/errors.js";
import {
  askQuestionBodySchema,
  browseProjectsQuerySchema,
  compareAnalysesBodySchema,
  createAnalysisBodySchema,
  importRunBodySchema,
  inspectProjectBodySchema,
  listAnalysesQuerySchema,
  projectDiffBodySchema,
  projectRefsQuerySchema,
  searchCommitsQuerySchema,
  whatIfBodySchema,
} from "./validators.js";
import type { AnalysisService } from "../modules/analysis/analysis.service.js";
import {
  browseDirectories,
  inspectLocalProject,
  listProjectBranches,
  searchProjectCommits,
} from "../modules/projects/project.service.js";

export interface AppDependencies {
  config: AppConfig;
  analysisService: AnalysisService;
}

export function createApp(deps: AppDependencies): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get(
    "/api/health",
    asyncRoute(async (_req, res) => {
      res.json({
        status: "ok",
        now: new Date().toISOString(),
        persistence: deps.config.persistenceDriver,
        ai:
          deps.config.ai.configured === true
            ? { configured: true }
            : { configured: false },
        pendingJobs: deps.analysisService.getPendingCount(),
      });
    }),
  );

  app.post(
    "/api/projects/inspect",
    asyncRoute(async (req, res) => {
      const body = inspectProjectBodySchema.parse(req.body);
      const inspection = await inspectLocalProject(body.localPath, {
        allowedRoots: deps.config.analyzedRoots,
      });
      res.json({
        ...inspection,
        files: inspection.files.slice(0, 200),
        totalFiles: inspection.files.length,
      });
    }),
  );

  app.get(
    "/api/projects/browse",
    asyncRoute(async (req, res) => {
      const query = browseProjectsQuerySchema.parse(req.query);
      res.json(
        await browseDirectories(query.path, deps.config.analyzedRoots),
      );
    }),
  );

  app.get(
    "/api/projects/branches",
    asyncRoute(async (req, res) => {
      const query = projectRefsQuerySchema.parse(req.query);
      res.json({
        branches: await listProjectBranches(query.localPath, {
          allowedRoots: deps.config.analyzedRoots,
        }),
      });
    }),
  );

  app.get(
    "/api/projects/commits",
    asyncRoute(async (req, res) => {
      const query = searchCommitsQuerySchema.parse(req.query);
      res.json({
        commits: await searchProjectCommits(query.localPath, {
          search: query.search,
          limit: query.limit,
          allowedRoots: deps.config.analyzedRoots,
        }),
      });
    }),
  );

  app.post(
    "/api/projects/diff",
    asyncRoute(async (req, res) => {
      const body = projectDiffBodySchema.parse(req.body);
      res.json(await deps.analysisService.diffProject(body));
    }),
  );

  app.post(
    "/api/projects/whatif",
    asyncRoute(async (req, res) => {
      const body = whatIfBodySchema.parse(req.body);
      res.json(
        await deps.analysisService.runWhatIf({
          localPath: body.localPath,
          baseRef: body.baseRef,
          filePath: body.filePath,
          keyColumn: body.keyColumn,
          keyValue: body.keyValue,
          column: body.column,
          newValue: body.newValue,
          goal: body.goal,
        }),
      );
    }),
  );

  app.post(
    "/api/analysis-runs",
    asyncRoute(async (req, res) => {
      const body = createAnalysisBodySchema.parse(req.body);
      const run = await deps.analysisService.create(body);
      res.status(202).json(run);
    }),
  );

  app.post(
    "/api/analysis-runs/compare",
    asyncRoute(async (req, res) => {
      const body = compareAnalysesBodySchema.parse(req.body);
      const run = await deps.analysisService.compare(body);
      res.status(202).json(run);
    }),
  );

  app.get(
    "/api/analysis-runs",
    asyncRoute(async (req, res) => {
      const query = listAnalysesQuerySchema.parse(req.query);
      res.json(await deps.analysisService.list(query.limit));
    }),
  );

  app.get(
    "/api/analysis-runs/:id",
    asyncRoute(async (req, res) => {
      const run = await deps.analysisService.findById(req.params.id as string);
      if (run === null) {
        throw new NotFoundError("ANALYSIS_RUN_NOT_FOUND", "Analysis run was not found.");
      }
      res.json(run);
    }),
  );

  app.post(
    "/api/analysis-runs/:id/questions",
    asyncRoute(async (req, res) => {
      const body = askQuestionBodySchema.parse(req.body);
      const exchange = await deps.analysisService.askQuestion({
        analysisRunId: req.params.id as string,
        question: body.question,
      });
      res.status(201).json(exchange);
    }),
  );

  app.get(
    "/api/analysis-runs/:id/questions",
    asyncRoute(async (req, res) => {
      res.json(await deps.analysisService.listExchanges(req.params.id as string));
    }),
  );

  app.post(
    "/api/analysis-runs/import",
    asyncRoute(async (req, res) => {
      const body = importRunBodySchema.parse(req.body);
      const run = await deps.analysisService.importRun(
        body.run as Record<string, unknown>,
      );
      res.status(201).json(run);
    }),
  );

  app.get("/openapi.json", (_req, res) => {
    res.json(buildOpenApiDocument());
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.0.3",
    info: {
      title: "Craftland Quality Analyzer",
      version: "2.0.0",
    },
    paths: {
      "/api/health": { get: { summary: "Service health" } },
      "/api/projects/inspect": { post: { summary: "Inspect a local Git project" } },
      "/api/projects/browse": { get: { summary: "Browse allowed directories for project selection" } },
      "/api/projects/branches": { get: { summary: "List branches of a local Git project" } },
      "/api/projects/commits": { get: { summary: "Search commits of a local Git project" } },
      "/api/projects/diff": { post: { summary: "Preview the file diff between two refs without running AI" } },
      "/api/projects/whatif": { post: { summary: "Evaluate a hypothetical single-cell config edit" } },
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
