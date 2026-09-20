import type { Logger } from "pino";

import { getLogger } from "../../shared/logger.js";

export class JobQueue {
  private readonly logger: Logger;
  private pending = 0;

  constructor(logger?: Logger) {
    this.logger = logger ?? getLogger();
  }

  enqueue(label: string, job: () => Promise<void>): void {
    this.pending += 1;
    void (async () => {
      try {
        await job();
      } catch (error) {
        this.logger.error({ err: error, label }, "background job failed");
      } finally {
        this.pending -= 1;
      }
    })();
  }

  getPendingCount(): number {
    return this.pending;
  }
}
