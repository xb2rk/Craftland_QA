/**
 * Project routes: inspection, browsing, refs, instant diff, and what-if.
 *
 * Responsibility: validate HTTP input and delegate to the project service
 * or AnalysisService. No business logic lives here.
 */
import type { Express } from "express";

import type { AppConfig } from "../../config/env.js";
import { asyncRoute } from "../../shared/async-handler.js";
import type { AnalysisService } from "../../modules/analysis/analysis.service.js";
import {
  browseDirectories,
  inspectLocalProject,
  listProjectBranches,
  searchProjectCommits,
} from "../../modules/projects/project.service.js";
import {
  browseProjectsQuerySchema,
  inspectProjectBodySchema,
  localizationAskBodySchema,
  localizationBodySchema,
  projectDiffBodySchema,
  projectRefsQuerySchema,
  searchCommitsQuerySchema,
  whatIfBodySchema,
  writerBodySchema,
} from "../validators.js";

export interface ProjectRouteDeps {
  config: AppConfig;
  analysisService: AnalysisService;
}

export function registerProjectRoutes(app: Express, deps: ProjectRouteDeps): void {
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
    "/api/projects/write",
    asyncRoute(async (req, res) => {
      const body = writerBodySchema.parse(req.body);
      res.json(
        await deps.analysisService.draftWriter({
          localPath: body.localPath,
          baseRef: body.baseRef,
          currentRef: body.currentRef,
          kind: body.kind,
          goal: body.goal,
          instructions: body.instructions,
        }),
      );
    }),
  );

  app.post(
    "/api/projects/localization",
    asyncRoute(async (req, res) => {
      const body = localizationBodySchema.parse(req.body);
      res.json(
        await deps.analysisService.runLocalization({
          localPath: body.localPath,
          baseRef: body.baseRef,
          goal: body.goal,
          filePath: body.filePath,
          mode: body.mode,
          language: body.language,
          key: body.key,
          glossary: body.glossary,
        }),
      );
    }),
  );

  app.post(
    "/api/projects/localization/ask",
    asyncRoute(async (req, res) => {
      const body = localizationAskBodySchema.parse(req.body);
      res.json(
        await deps.analysisService.askLocalization({
          localPath: body.localPath,
          baseRef: body.baseRef,
          filePath: body.filePath,
          question: body.question,
          history: body.history,
          glossary: body.glossary,
        }),
      );
    }),
  );
}
