/**
 * Comparison-run background execution.
 *
 * Responsibility: diff two completed runs (deterministic A/B delta) and
 * persist the comparison report. AI is intentionally skipped here — the
 * comparison is a deterministic operation over stored findings.
 */
import { AppError } from "../../../shared/errors.js";
import { getLogger } from "../../../shared/logger.js";
import type { AnalysisRun, Finding } from "../analysis-run.entity.js";
import type { AnalysisRunRepository } from "../../../persistence/repository.js";

export async function executeComparisonRun(
  repository: AnalysisRunRepository,
  runId: string,
): Promise<void> {
  const stored = await repository.findById(runId);
  if (
    stored === null ||
    stored.status !== "queued" ||
    stored.comparisonSourceRunIds === undefined
  ) {
    return;
  }
  await repository.save({ ...stored, status: "running" });
  try {
    const [runA, runB] = await Promise.all([
      repository.findById(stored.comparisonSourceRunIds[0]),
      repository.findById(stored.comparisonSourceRunIds[1]),
    ]);
    if (
      runA?.comparison === undefined ||
      runB?.comparison === undefined ||
      runA.status !== "completed" ||
      runB.status !== "completed"
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "Both source runs must be completed analyses with comparisons.",
      );
    }

    const findings: Finding[] = [
      ...summarizeRunDelta("A", runA),
      ...summarizeRunDelta("B", runB),
      ...diffFindings(runA.findings, runB.findings),
    ];

    await repository.save({
      ...stored,
      status: "completed",
      completedAt: new Date().toISOString(),
      projectSummary: runB.projectSummary,
      comparison: runB.comparison,
      findings,
      aiReport: {
        schema_version: "1.0",
        stage: "comparison",
        status: "completed",
        summary: {
          overall_assessment: `Compared ${runA.id} against ${runB.id}.`,
          risk_level: "unknown",
          confidence: "low",
          change_scope: "unknown",
        },
        source_runs: [runA.id, runB.id],
        goal: stored.goal,
      },
      aiStatus: "skipped",
    });
  } catch (error) {
    getLogger().error({ err: error, runId }, "comparison run failed");
    const failed = await repository.findById(runId);
    if (failed !== null) {
      await repository.save({
        ...failed,
        status: "failed",
        completedAt: new Date().toISOString(),
        error:
          error instanceof AppError
            ? error.message
            : "Comparison run failed unexpectedly.",
      });
    }
  }
}

function summarizeRunDelta(label: "A" | "B", run: AnalysisRun): Finding[] {
  return [
    {
      code: "COMPARISON_SOURCE_SUMMARY",
      severity: "info",
      message: `Run ${label} (${run.id.slice(0, 8)}): ${run.findings.length} findings, ${run.comparison?.changedFiles.length ?? 0} changed files.`,
      filePath: "<comparison>",
      evidence: {
        source: label,
        runId: run.id,
        findingCount: run.findings.length,
        changedFiles: run.comparison?.changedFiles.length ?? 0,
      },
    },
  ];
}

function diffFindings(left: Finding[], right: Finding[]): Finding[] {
  const key = (finding: Finding) =>
    `${finding.code} ${finding.filePath} ${finding.line ?? ""} ${finding.message}`;
  const leftKeys = new Set(left.map(key));
  const rightKeys = new Set(right.map(key));
  const findings: Finding[] = [];
  for (const finding of right) {
    if (!leftKeys.has(key(finding))) {
      findings.push({ ...finding, filePath: finding.filePath });
    }
  }
  for (const finding of left) {
    if (!rightKeys.has(key(finding))) {
      findings.push({
        code: "COMPARISON_FINDING_REMOVED",
        severity: "info",
        message: `No longer reported in B: ${finding.message}`,
        filePath: finding.filePath,
        line: finding.line,
        evidence: { originalCode: finding.code },
      });
    }
  }
  void rightKeys;
  return findings;
}
