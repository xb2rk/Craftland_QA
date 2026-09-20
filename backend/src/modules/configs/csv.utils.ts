/**
 * CSV serialization helper shared by analysis and what-if runners.
 *
 * Responsibility: quote CSV cells exactly as the deterministic layer
 * expects, so edited content re-parses to the same rows.
 */
export function serializeCsvRow(cells: string[]): string {
  return cells
    .map((cell) =>
      /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell,
    )
    .join(",");
}
