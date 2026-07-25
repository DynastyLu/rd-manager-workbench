/**
 * Neutralizes spreadsheet formula triggers so exported CSV/XLSX text cells are
 * rendered as plain text instead of being executed by spreadsheet applications.
 */
export function safeExportText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}
