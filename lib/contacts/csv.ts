/**
 * Small RFC 4180 CSV reader/writer (quoted fields, "" escapes, CRLF/LF, newlines inside quotes,
 * UTF-8 BOM). Written in-house so imports need no extra dependency.
 */

export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully blank lines (e.g. trailing newline, Excel padding).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Rows of objects keyed by the header row. Missing cells become "". */
export function parseCsvWithHeader(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const [headerRow = [], ...body] = parseCsv(text);
  const headers = headerRow.map((h) => h.trim());
  const rows = body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])));
  return { headers, rows };
}

/**
 * Cells starting with = + - @ (or tab/CR) can run as formulas when the file is opened in Excel or
 * Google Sheets. Prefix them with ' so they stay plain text (OWASP CSV injection guidance).
 */
function neutralize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = neutralize(cell == null ? "" : String(cell));
          return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\r\n");
}
