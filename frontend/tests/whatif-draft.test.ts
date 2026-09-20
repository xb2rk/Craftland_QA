import { describe, expect, it } from "vitest";

import { draftEditFromPrompt } from "../src/whatif/prompt-draft.js";

const FILES = ["Assets/CSV/ShopData.csv", "Assets/CSV/ZombieData.csv"];

describe("draftEditFromPrompt", () => {
  it("parses a set-pattern with file, key, column, and value", () => {
    const draft = draftEditFromPrompt("Set Price to 150 for Id 1 in ShopData.csv", FILES);
    expect(draft.filePath).toBe("Assets/CSV/ShopData.csv");
    expect(draft.column).toBe("Price");
    expect(draft.newValue).toBe("150");
    expect(draft.keyValue).toBe("1");
  });

  it("parses a from/to change", () => {
    const draft = draftEditFromPrompt("Change Price from 100 to 150 in ShopData for Id 7", FILES);
    expect(draft.filePath).toBe("Assets/CSV/ShopData.csv");
    expect(draft.column).toBe("Price");
    expect(draft.newValue).toBe("150");
    expect(draft.keyValue).toBe("7");
  });

  it("flags relative changes instead of guessing a value", () => {
    const draft = draftEditFromPrompt("Bump HP by 50 for id 12 in ZombieData", FILES);
    expect(draft.filePath).toBe("Assets/CSV/ZombieData.csv");
    expect(draft.column).toBe("HP");
    expect(draft.newValue).toBeUndefined();
    expect(draft.notes.join(" ")).toMatch(/relative/i);
  });

  it("asks for input on an empty prompt", () => {
    const draft = draftEditFromPrompt("   ", FILES);
    expect(draft.filePath).toBeUndefined();
    expect(draft.notes.length).toBeGreaterThan(0);
  });
});
