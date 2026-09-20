/**
 * Express application wiring.
 *
 * Responsibility: middleware, health, route registration, and error
 * handling only. Route handlers live in ./routes, the API catalogue in
 * ./openapi.
 */
import cors from "cors";
import express from "express";
import helmet from "helmet";

import type { AppConfig } from "../config/env.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.js";
import { asyncRoute } from "../shared/async-handler.js";
import type { AnalysisService } from "../modules/analysis/analysis.service.js";
import { registerAnalysisRoutes } from "./routes/analysis.routes.js";
import { registerProjectRoutes } from "./routes/project.routes.js";
import { buildOpenApiDocument } from "./openapi.js";

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

  registerProjectRoutes(app, deps);
  registerAnalysisRoutes(app, deps);

  app.get("/openapi.json", (_req, res) => {
    res.json(buildOpenApiDocument());
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
