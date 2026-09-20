import { describe, expect, it } from "vitest";

import { parseUnifiedDiff, splitHunkRows } from "../src/components/diff-parse.js";

const SAMPLE = `diff --git a/Shop.csv b/Shop.csv
index abc..def 100644
--- a/Shop.csv
+++ b/Shop.csv
@@ -1,2 +1,2 @@
 Id,Price
-1,100
+1,150
diff --git a/New.csv b/New.csv
new file mode 100644
index 000..123
--- /dev/null
+++ b/New.csv
@@ -0,0 +1,1 @@
+Id,Price
`;

describe("parseUnifiedDiff", () => {
  it("parses per-file status, counts, and hunks", () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("Shop.csv");
    expect(files[0].status).toBe("modified");
    expect(files[0].added).toBe(1);
    expect(files[0].deleted).toBe(1);
    expect(files[0].hunks).toHaveLength(1);
    expect(files[1].path).toBe("New.csv");
    expect(files[1].status).toBe("added");
    expect(files[1].added).toBe(1);
  });

  it("pairs removals with additions for split rows", () => {
    const files = parseUnifiedDiff(SAMPLE);
    const rows = splitHunkRows(files[0].hunks[0]);
    expect(rows[0].old.text).toBe("Id,Price");
    expect(rows[0].new.text).toBe("Id,Price");
    expect(rows[1].old).toMatchObject({ no: 2, text: "1,100", type: "del" });
    expect(rows[1].new).toMatchObject({ no: 2, text: "1,150", type: "add" });
  });
});
