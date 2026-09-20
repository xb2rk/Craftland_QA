/**
 * Analysis-run routes: lifecycle, comparison, Q&A, and import.
 *
 * Responsibility: validate HTTP input and delegate to AnalysisService.
 * No business logic lives here.
 */
import type { Express } from "express";

import { asyncRoute } from "../../shared/async-handler.js";
import { NotFoundError } from "../../shared/errors.js";
import type { AnalysisService } from "../../modules/analysis/analysis.service.js";
import {
  askQuestionBodySchema,
  compareAnalysesBodySchema,
  createAnalysisBodySchema,
  importRunBodySchema,
  listAnalysesQuerySchema,
} from "../validators.js";

export interface AnalysisRouteDeps {
  analysisService: AnalysisService;
}

export function registerAnalysisRoutes(app: Express, deps: AnalysisRouteDeps): void {
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
}
