export interface PromptDraft {
  filePath?: string;
  keyColumn?: string;
  keyValue?: string;
  column?: string;
  newValue?: string;
  notes: string[];
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cleanValue(value: string): string {
  return value.replace(/^[“”"']+|[“”"']+$/g, "").replace(/[.,;!?]+$/g, "");
}

/** Heuristic prompt → structured edit. Only fills what it can defend; the rest stays manual. */
export function draftEditFromPrompt(prompt: string, csvFiles: string[]): PromptDraft {
  const draft: PromptDraft = { notes: [] };
  const flat = normalizeToken(prompt);
  if (flat.length === 0) {
    draft.notes.push("Describe the hypothetical first — e.g. “set Price to 150 for Id 1”.");
    return draft;
  }

  let bestFile: string | undefined;
  let bestScore = 0;
  for (const file of csvFiles) {
    const base = file.split("/").slice(-1)[0] ?? file;
    for (const candidate of [file, base, base.replace(/\.csv$/i, "")]) {
      const token = normalizeToken(candidate);
      if (token.length >= 4 && flat.includes(token) && token.length > bestScore) {
        bestFile = file;
        bestScore = token.length;
      }
    }
  }
  if (bestFile) {
    draft.filePath = bestFile;
    draft.notes.push(`Detected file ${bestFile}.`);
  } else {
    draft.notes.push("No project CSV matched — name the file in your question.");
  }

  const setMatch = /set\s+([A-Za-z_]\w*)\s*(?:to|=|→|->)\s*(?:"([^"]+)"|'([^']+)'|([^\s,;]+))/i.exec(
    prompt,
  );
  const changeMatch =
    setMatch === null
      ? /([A-Za-z_]\w*)\s+from\s+[^\s,;]+\s+to\s+(?:"([^"]+)"|'([^']+)'|([^\s,;]+))/i.exec(prompt)
      : null;
  const assignMatch =
    setMatch === null && changeMatch === null
      ? /([A-Za-z_]\w*)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s,;]+))/.exec(prompt)
      : null;
  const bumpMatch =
    setMatch === null && changeMatch === null && assignMatch === null
      ? /(?:bump|raise|increase|lower|decrease|reduce)\s+(?:the\s+)?([A-Za-z_][\w ]*?)\s+by\s+([^\s,;]+)/i.exec(
          prompt,
        )
      : null;

  if (setMatch) {
    draft.column = setMatch[1];
    draft.newValue = cleanValue(setMatch[2] ?? setMatch[3] ?? setMatch[4] ?? "");
  } else if (changeMatch) {
    draft.column = changeMatch[1];
    draft.newValue = cleanValue(changeMatch[2] ?? changeMatch[3] ?? changeMatch[4] ?? "");
  } else if (assignMatch) {
    draft.column = assignMatch[1];
    draft.newValue = cleanValue(assignMatch[2] ?? assignMatch[3] ?? assignMatch[4] ?? "");
  }
  if (draft.column && draft.newValue) {
    draft.notes.push(`Detected ${draft.column} → ${draft.newValue}.`);
  } else if (bumpMatch) {
    draft.column = bumpMatch[1].trim().replace(/\s+/g, "");
    draft.notes.push(
      "That reads as a relative change (“by …”) — reply with the absolute new value.",
    );
  } else {
    draft.notes.push("No column/value pattern found — try “set Price to 150”.");
  }

  const keyColumnMatch = /\bkey\s+column\s+([A-Za-z_]\w*)/i.exec(prompt);
  if (keyColumnMatch) draft.keyColumn = keyColumnMatch[1];

  const idMatch =
    /(?:\bfor\s+)?\b(id|key)\b\s*[=:#]?\s*(?:"([^"]+)"|'([^']+)'|([^\s,;]+))/i.exec(prompt) ??
    /\bfor\s+"([^"]+)"/i.exec(prompt);
  if (idMatch) {
    const value = cleanValue(idMatch[2] ?? idMatch[3] ?? idMatch[4] ?? idMatch[1] ?? "");
    if (value.length > 0 && value.toLowerCase() !== "id" && value.toLowerCase() !== "key") {
      draft.keyValue = value;
      draft.notes.push(`Detected row key ${value}.`);
    }
  } else {
    draft.notes.push("No row key found — say which row this edit targets.");
  }
  return draft;
}
