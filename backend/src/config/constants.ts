export const SUPPORTED_CONFIG_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".xml",
  ".properties",
]);

export const SUPPORTED_SOURCE_EXTENSIONS = new Set([
  ".fcg",
  ".fcc",
  ".cs",
  ".lua",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".go",
  ".java",
  ".kt",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
]);

export const SUPPORTED_TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".patch",
  ".diff",
  ".asset",
]);

export const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".analysis-workspaces",
  "library",
  "libraries",
  "temp",
  "logs",
  "cache",
  "build",
  "builds",
  "obj",
  "node_modules",
  "dist",
  "coverage",
  "usersettings",
]);

export const EXCLUDED_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".npmrc",
  "id_rsa",
  "id_ed25519",
]);

export const DEFAULT_DISCOVERY_LIMITS = {
  maxFiles: 10_000,
  maxFileBytes: 2 * 1024 * 1024,
} as const;

export const DEFAULT_DIFF_LIMITS = {
  maxDiffCharacters: 300_000,
} as const;

export const DEFAULT_CONFIG_COMPARE_LIMITS = {
  maxFindings: 500,
} as const;

export const ANALYSIS_POLL_DEFAULTS = {
  listLimit: 100,
  maxListLimit: 200,
} as const;
