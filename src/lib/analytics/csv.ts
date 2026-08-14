/**
 * CSV export.
 *
 * Two details that are easy to get wrong and expensive to get wrong in a product whose
 * primary market writes Arabic:
 *
 * 1. **A UTF-8 BOM is prepended.** Excel on Windows — overwhelmingly what a clinic manager
 *    opens a downloaded report in — assumes the system ANSI codepage without it, and every
 *    Arabic doctor and patient name renders as mojibake. The BOM is three bytes that make
 *    the file readable for the people it is for.
 *
 * 2. **Formula injection is neutralised.** A cell beginning `=`, `+`, `-`, `@`, tab, or CR
 *    is interpreted as a formula by Excel and LibreOffice. Since a doctor's or service's
 *    name is user-supplied, an exported report is otherwise a delivery vehicle for
 *    `=HYPERLINK(...)` or a DDE payload aimed at whoever opens it. Such values are prefixed
 *    with a single quote, which spreadsheets treat as "text, literally".
 */

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

function escapeCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const guarded = FORMULA_PREFIXES.some((prefix) => raw.startsWith(prefix)) ? `'${raw}` : raw;

  // Quote when the value contains a delimiter, a quote, or a newline; double any quotes.
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

export const UTF8_BOM = '﻿';

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(escapeCell).join(','), ...rows.map((row) => row.map(escapeCell).join(','))];
  // CRLF per RFC 4180 — the format spreadsheets are least surprised by.
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      // Filename is built server-side from a fixed prefix plus a date, never from input.
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
