import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type RequestHandler
} from "express";
import { z } from "zod";

import { InMemoryAnalysisRunRepository } from "./repositories/analysis-run-repository.js";
import {
  AnalysisRunner,
  type CreateAnalysisRunInput
} from "./services/analysis-runner.js";
import {
  inspectLocalProject,
  type ProjectInspection
} from "./services/project-inspector.js";

type InspectProject = (localPath: string) => Promise<ProjectInspection>;

export interface AppDependencies {
  inspectProject?: InspectProject;
  analysisRunner?: Pick<
    AnalysisRunner,
    "create" | "findById" | "list"
  >;
  aiConfigured?: boolean;
}

const inspectProjectBodySchema = z.object({
  localPath: z.string().trim().min(1)
});

const createAnalysisBodySchema = z.object({
  localPath: z.string().trim().min(1),
  baseRef: z.string().trim().min(1).default("HEAD~1"),
  currentRef: z.string().trim().min(1).default("WORKTREE"),
  goal: z.string().trim().min(1)
});

export function createApp(dependencies: AppDependencies = {}) {
  const inspectProject = dependencies.inspectProject ?? inspectLocalProject;
  const analysisRunner =
    dependencies.analysisRunner ??
    new AnalysisRunner(
      new InMemoryAnalysisRunRepository(),
      { inspectProject }
    );
  const app = express();

  app.disable("etag");
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", (_request, response, next) => {
    response.set("Cache-Control", "no-store, no-cache, must-revalidate");
    next();
  });

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "craftland-quality-analyzer-backend",
      integrations: {
        ai: dependencies.aiConfigured === true ? "configured" : "not_configured"
      }
    });
  });

  app.post(
    "/api/projects/inspect",
    asyncRoute(async (request, response) => {
      const input = inspectProjectBodySchema.parse(request.body);
      const result = await inspectProject(input.localPath);
      response.json({
        ...result,
        files: result.files.map(
          ({ relativePath, extension, sizeBytes, kind }) => ({
            relativePath,
            extension,
            sizeBytes,
            kind
          })
        )
      });
    })
  );

  app.get(
    "/api/analysis-runs",
    asyncRoute(async (_request, response) => {
      response.json({ items: await analysisRunner.list() });
    })
  );

  app.post(
    "/api/analysis-runs",
    asyncRoute(async (request, response) => {
      const input = createAnalysisBodySchema.parse(
        request.body
      ) as CreateAnalysisRunInput;
      const result = await analysisRunner.create(input);
      response.status(202).json(result);
    })
  );

  app.get(
    "/api/analysis-runs/:id",
    asyncRoute(async (request, response) => {
      const run = await analysisRunner.findById(request.params.id);
      if (run === null) {
        response.status(404).json({
          error: {
            code: "ANALYSIS_RUN_NOT_FOUND",
            message: "Analysis run was not found."
          }
        });
        return;
      }
      response.json(run);
    })
  );

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route was not found."
      }
    });
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next
  ) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          details: error.issues
        }
      });
      return;
    }

    response.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unexpected error."
      }
    });
  };
  app.use(errorHandler);

  return app;
}

function asyncRoute(
  handler: (
    request: express.Request,
    response: express.Response
  ) => Promise<void>
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}
