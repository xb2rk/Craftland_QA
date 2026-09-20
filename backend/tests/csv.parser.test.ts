import { describe, expect, it } from "vitest";

import { parseCsvContent } from "../src/modules/configs/csv.parser.js";

describe("parseCsvContent", () => {
  it("parses quoted values with commas and escaped quotes", () => {
    const rows = parseCsvContent('Id,Name\nint,string\n1,"a,b""c"""\n');
    expect(rows).toEqual([
      ["Id", "Name"],
      ["int", "string"],
      ["1", 'a,b"c"'],
    ]);
  });

  it("skips empty lines", () => {
    const rows = parseCsvContent("A,B\nint,int\n\n1,2\n");
    expect(rows).toEqual([
      ["A", "B"],
      ["int", "int"],
      ["1", "2"],
    ]);
  });
});
