import { beforeEach, describe, expect, it } from "vitest";

import { unknownQuestion } from "../src/components/AiReport.js";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../src/settings/store.js";
import { loadThreads, saveThreads } from "../src/whatif/threads.js";

beforeEach(() => {
  localStorage.clear();
});

describe("unknownQuestion", () => {
  it("builds a question from a structured unknown", () => {
    expect(unknownQuestion({ id: "U001", statement: "Coverage is unclear." })).toBe(
      "About U001: Coverage is unclear. — is it covered by the evidence, and what should I check?",
    );
  });

  it("falls back to a generic question", () => {
    expect(unknownQuestion("mystery")).toBe("Is this gap covered: mystery");
  });
});

describe("settings store", () => {
  it("returns defaults when empty", () => {
    expect(loadSettings().verbosity).toBe("auto");
    expect(loadSettings().templates).toEqual([]);
  });

  it("round-trips settings", () => {
    saveSettings({ ...DEFAULT_SETTINGS, verbosity: "short", defaultLens: "economy" });
    const loaded = loadSettings();
    expect(loaded.verbosity).toBe("short");
    expect(loaded.defaultLens).toBe("economy");
  });

  it("drops unknown verbosity values", () => {
    localStorage.setItem("cqa.settings.v1", JSON.stringify({ verbosity: "huge" }));
    expect(loadSettings().verbosity).toBe("auto");
  });
});

describe("thread store", () => {
  it("round-trips threads", () => {
    saveThreads([
      {
        id: "t1",
        projectId: "p",
        baseRef: "HEAD",
        question: "What if Price goes to 9?",
        notes: [],
        status: "needs-detail",
        createdAt: "x",
      },
    ]);
    expect(loadThreads()).toHaveLength(1);
  });

  it("returns [] for corrupt payloads", () => {
    localStorage.setItem("cqa.whatif.threads.v1", "[1,2]");
    expect(loadThreads()).toEqual([]);
  });
});
