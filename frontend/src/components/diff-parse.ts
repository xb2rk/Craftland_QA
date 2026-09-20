export type DiffLineType = "context" | "add" | "del" | "note";

export interface DiffLine {
  type: DiffLineType;
  oldNo?: number;
  newNo?: number;
  text: string;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export type DiffFileStatus = "added" | "modified" | "deleted" | "renamed";

export interface DiffFile {
  path: string;
  previousPath?: string;
  status: DiffFileStatus;
  added: number;
  deleted: number;
  hunks: DiffHunk[];
  raw: string;
}

export type SplitCellType = "context" | "add" | "del" | "empty" | "note";

export interface SplitCell {
  no?: number;
  text: string;
  type: SplitCellType;
}

export interface SplitRow {
  old: SplitCell;
  new: SplitCell;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function stripPrefix(path: string): string {
  if (path === "/dev/null") return path;
  if (path.startsWith("a/") || path.startsWith("b/")) return path.slice(2);
  return path;
}

function splitSections(diff: string): string[] {
  return diff
    .replace(/\r\n/g, "\n")
    .split(/(?=^diff --git )/m)
    .map((part) => part.replace(/\n$/, ""))
    .filter((part) => part.trim().length > 0);
}

function parseHunk(header: string, body: string[]): DiffHunk {
  const match = HUNK_HEADER.exec(header);
  const oldStart = match ? Number(match[1]) : 0;
  const oldCount = match ? Number(match[2] ?? 1) : 0;
  const newStart = match ? Number(match[3]) : 0;
  const newCount = match ? Number(match[4] ?? 1) : 0;
  let oldNo = oldStart;
  let newNo = newStart;
  const lines: DiffLine[] = [];
  for (const raw of body) {
    if (raw.startsWith("\\")) {
      lines.push({ type: "note", text: raw });
      continue;
    }
    const marker = raw.charAt(0);
    const text = raw.length > 0 ? raw.slice(1) : "";
    if (marker === "+") {
      lines.push({ type: "add", newNo, text });
      newNo += 1;
    } else if (marker === "-") {
      lines.push({ type: "del", oldNo, text });
      oldNo += 1;
    } else {
      lines.push({ type: "context", oldNo, newNo, text });
      oldNo += 1;
      newNo += 1;
    }
  }
  return { header, oldStart, oldCount, newStart, newCount, lines };
}

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  for (const section of splitSections(diff)) {
    const rawLines = section.split("\n");
    let oldPath: string | undefined;
    let newPath: string | undefined;
    let renameFrom: string | undefined;
    let renameTo: string | undefined;
    let isNew = false;
    let isDeleted = false;
    const hunks: DiffHunk[] = [];
    let currentHeader: string | null = null;
    let currentBody: string[] = [];
    const flush = (): void => {
      if (currentHeader !== null) hunks.push(parseHunk(currentHeader, currentBody));
      currentHeader = null;
      currentBody = [];
    };
    for (const line of rawLines) {
      if (line.startsWith("diff --git ")) continue;
      if (line.startsWith("new file")) {
        isNew = true;
        continue;
      }
      if (line.startsWith("deleted file")) {
        isDeleted = true;
        continue;
      }
      if (line.startsWith("rename from ")) {
        renameFrom = stripPrefix(line.slice("rename from ".length).trim());
        continue;
      }
      if (line.startsWith("rename to ")) {
        renameTo = stripPrefix(line.slice("rename to ".length).trim());
        continue;
      }
      if (line.startsWith("--- ")) {
        oldPath = stripPrefix(line.slice(4).split("\t")[0].trim());
        continue;
      }
      if (line.startsWith("+++ ")) {
        newPath = stripPrefix(line.slice(4).split("\t")[0].trim());
        continue;
      }
      if (line.startsWith("@@ ")) {
        flush();
        currentHeader = line;
        continue;
      }
      if (currentHeader !== null) {
        currentBody.push(line);
        continue;
      }
    }
    flush();

    let path = newPath ?? oldPath ?? "unknown";
    let status: DiffFileStatus = "modified";
    let previousPath: string | undefined;
    if (isNew || oldPath === "/dev/null") {
      status = "added";
      path = newPath ?? path;
    } else if (isDeleted || newPath === "/dev/null") {
      status = "deleted";
      path = oldPath ?? path;
    } else if (renameFrom !== undefined || renameTo !== undefined) {
      status = "renamed";
      previousPath = renameFrom ?? oldPath;
      path = renameTo ?? newPath ?? path;
    }
    let added = 0;
    let deleted = 0;
    for (const hunk of hunks) {
      for (const entry of hunk.lines) {
        if (entry.type === "add") added += 1;
        if (entry.type === "del") deleted += 1;
      }
    }
    files.push({ path, previousPath, status, added, deleted, hunks, raw: section });
  }
  return files;
}

export function splitHunkRows(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = [];
  const empty = (side: "old" | "new"): SplitCell =>
    side === "old"
      ? { text: "", type: "empty" }
      : { text: "", type: "empty" };
  const pending: DiffLine[] = [];
  const flushPending = (): void => {
    for (const del of pending) {
      rows.push({
        old: { no: del.oldNo, text: del.text, type: "del" },
        new: empty("new"),
      });
    }
    pending.length = 0;
  };
  for (const line of hunk.lines) {
    if (line.type === "context") {
      flushPending();
      rows.push({
        old: { no: line.oldNo, text: line.text, type: "context" },
        new: { no: line.newNo, text: line.text, type: "context" },
      });
    } else if (line.type === "del") {
      pending.push(line);
    } else if (line.type === "add") {
      const del = pending.shift();
      if (del) {
        rows.push({
          old: { no: del.oldNo, text: del.text, type: "del" },
          new: { no: line.newNo, text: line.text, type: "add" },
        });
      } else {
        rows.push({ old: empty("old"), new: { no: line.newNo, text: line.text, type: "add" } });
      }
    } else {
      flushPending();
      rows.push({
        old: { text: line.text, type: "note" },
        new: { text: line.text, type: "note" },
      });
    }
  }
  flushPending();
  return rows;
}
