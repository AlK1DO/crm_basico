/**
 * dataCleaner.ts
 *
 * Limpieza de datos mejorada.
 * - Detecta todos los valores considerados ausentes (null, "", "N/A", "-", etc.)
 * - NO convierte vacíos a 0 automáticamente.
 * - Distingue celda vacía, registro incompleto, duplicado, valor inválido, fecha inválida.
 * - El resultado se persiste de vuelta al dataset (cleanRows).
 */

import type { CleaningReport, FieldCleaningReport, ColumnInfo } from '../types';
import { isMissing, parseNumeric } from './metricsCalculator';

// ─── Opciones de limpieza ─────────────────────────────────────────────────────

export interface CleaningOptions {
  removeDuplicates: boolean;
  removeEmptyRows: boolean;       // filas donde TODOS los campos son vacíos
  removeIncompleteRows: boolean;  // filas donde campos CLAVE son vacíos
  trimWhitespace: boolean;
  normalizeCase: 'none' | 'lower' | 'upper';
  imputeNumericStrategy: 'none' | 'mean' | 'median'; // NO activar por defecto
  fixDates: boolean;              // normalizar formatos de fecha
  keyColumns: string[];           // columnas consideradas "clave" para incompletos
}

export const DEFAULT_CLEANING_OPTIONS: CleaningOptions = {
  removeDuplicates: true,
  removeEmptyRows: true,
  removeIncompleteRows: false,
  trimWhitespace: true,
  normalizeCase: 'none',
  imputeNumericStrategy: 'none',
  fixDates: false,
  keyColumns: [],
};

// ─── Función principal ────────────────────────────────────────────────────────

export function cleanDataset(
  rows: Record<string, string>[],
  columns: string[],
  columnInfo: ColumnInfo[],
  options: CleaningOptions,
): { cleanedRows: Record<string, string>[]; report: CleaningReport } {
  const originalCount = rows.length;
  let workRows = rows.map((r) => ({ ...r })); // copia profunda

  let trimmedCells = 0;
  let invalidValuesFixed = 0;

  // ── 1. Trim de espacios en blanco ──────────────────────────────────────────
  if (options.trimWhitespace) {
    workRows = workRows.map((row) => {
      const newRow: Record<string, string> = {};
      for (const col of columns) {
        const val = String(row[col] ?? '');
        const trimmed = val.trim().replace(/\s+/g, ' '); // normalizar múltiples espacios
        if (trimmed !== val) trimmedCells++;
        newRow[col] = trimmed;
      }
      return newRow;
    });
  }

  // ── 2. Normalizar case en categóricos ──────────────────────────────────────
  if (options.normalizeCase !== 'none') {
    const categoricalCols = columnInfo
      .filter((c) => c.type === 'categorical')
      .map((c) => c.name);

    workRows = workRows.map((row) => {
      const newRow = { ...row };
      for (const col of categoricalCols) {
        const val = newRow[col];
        if (val) {
          newRow[col] = options.normalizeCase === 'lower' ? val.toLowerCase() : val.toUpperCase();
        }
      }
      return newRow;
    });
  }

  // ── 3. Eliminar filas completamente vacías ─────────────────────────────────
  let emptyRowsRemoved = 0;
  if (options.removeEmptyRows) {
    const before = workRows.length;
    workRows = workRows.filter((row) =>
      columns.some((col) => !isMissing(row[col]))
    );
    emptyRowsRemoved = before - workRows.length;
  }

  // ── 4. Eliminar filas incompletas en columnas clave ────────────────────────
  if (options.removeIncompleteRows && options.keyColumns.length > 0) {
    workRows = workRows.filter((row) =>
      options.keyColumns.every((col) => !isMissing(row[col]))
    );
  }

  // ── 5. Eliminar duplicados (JSON.stringify sobre todas las columnas) ────────
  let duplicatesRemoved = 0;
  if (options.removeDuplicates) {
    const seen = new Set<string>();
    const before = workRows.length;
    workRows = workRows.filter((row) => {
      const key = JSON.stringify(columns.map((c) => (row[c] ?? '').trim().toLowerCase()));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    duplicatesRemoved = before - workRows.length;
  }

  // ── 6. Imputación numérica (NUNCA convierte vacíos a 0) ───────────────────
  if (options.imputeNumericStrategy !== 'none') {
    const numericCols = columnInfo
      .filter((c) => c.type === 'monetary' || c.type === 'quantity')
      .map((c) => c.name);

    for (const col of numericCols) {
      const validValues = workRows
        .map((r) => parseNumeric(r[col]))
        .filter((v): v is number => v !== null);

      if (validValues.length === 0) continue;

      let fillValue: number;
      if (options.imputeNumericStrategy === 'mean') {
        fillValue = validValues.reduce((a, b) => a + b, 0) / validValues.length;
      } else {
        // median
        const sorted = [...validValues].sort((a, b) => a - b);
        fillValue = sorted[Math.floor(sorted.length / 2)];
      }

      workRows = workRows.map((row) => {
        if (isMissing(row[col])) {
          invalidValuesFixed++;
          return { ...row, [col]: fillValue.toFixed(2) };
        }
        return row;
      });
    }
  }

  // ── 7. Normalizar fechas ───────────────────────────────────────────────────
  if (options.fixDates) {
    const dateCols = columnInfo
      .filter((c) => c.type === 'temporal')
      .map((c) => c.name);

    for (const col of dateCols) {
      workRows = workRows.map((row) => {
        const raw = row[col];
        if (isMissing(raw)) return row;
        const normalized = normalizeDate(raw);
        if (normalized && normalized !== raw) {
          invalidValuesFixed++;
          return { ...row, [col]: normalized };
        }
        return row;
      });
    }
  }

  // ── 8. Generar reporte por campo ──────────────────────────────────────────

  const fieldReports: FieldCleaningReport[] = columns.map((col) => {
    const colInfo = columnInfo.find((c) => c.name === col);
    const type = colInfo?.type ?? 'unknown';
    const missingCount = rows.filter((r) => isMissing(r[col])).length;

    let invalidCount = 0;
    if (type === 'monetary' || type === 'quantity') {
      invalidCount = rows.filter((r) => {
        const v = r[col];
        if (isMissing(v)) return false;
        return parseNumeric(v) === null;
      }).length;
    }
    if (type === 'temporal') {
      invalidCount = rows.filter((r) => {
        const v = r[col];
        if (isMissing(v)) return false;
        return !isValidDate(v);
      }).length;
    }

    const action = buildActionDescription(type, options, missingCount, invalidCount);

    return { column: col, type, missingCount, invalidCount, action };
  });

  // ── 9. Calidad de datos ────────────────────────────────────────────────────

  const totalCells = originalCount * columns.length;
  const totalMissingBefore = fieldReports.reduce((acc, f) => acc + f.missingCount, 0);
  const totalInvalidBefore = fieldReports.reduce((acc, f) => acc + f.invalidCount, 0);
  const problemsBefore = totalMissingBefore + totalInvalidBefore;
  const qualityBefore = totalCells > 0 ? Math.max(0, 100 - (problemsBefore / totalCells) * 100) : 100;

  const totalMissingAfter = workRows.reduce(
    (acc, row) => acc + columns.filter((c) => isMissing(row[c])).length, 0
  );
  const qualityAfter = totalCells > 0 ? Math.max(0, 100 - (totalMissingAfter / (workRows.length * columns.length)) * 100) : 100;

  const report: CleaningReport = {
    originalRows: originalCount,
    cleanedRows: workRows.length,
    duplicatesRemoved,
    emptyRowsRemoved,
    invalidValuesFixed,
    trimmedCells,
    dataQualityBefore: parseFloat(qualityBefore.toFixed(1)),
    dataQualityAfter: parseFloat(qualityAfter.toFixed(1)),
    fieldReports,
  };

  return { cleanedRows: workRows, report };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDate(raw: string): string | null {
  const s = raw.trim();

  // DD/MM/YYYY → YYYY-MM-DD
  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  if (ddmmyyyy.test(s)) {
    const [, d, m, y] = s.match(ddmmyyyy)!;
    return `${y}-${m}-${d}`;
  }

  // DD-MM-YYYY → YYYY-MM-DD
  const ddmmyyyy2 = /^(\d{2})-(\d{2})-(\d{4})$/;
  if (ddmmyyyy2.test(s)) {
    const [, d, m, y] = s.match(ddmmyyyy2)!;
    return `${y}-${m}-${d}`;
  }

  // Ya está en formato ISO, dejarlo
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;

  return null;
}

function isValidDate(raw: string): boolean {
  const s = raw.trim();
  const patterns = [
    /^\d{4}-\d{2}-\d{2}/,
    /^\d{2}\/\d{2}\/\d{4}/,
    /^\d{2}-\d{2}-\d{4}/,
  ];
  if (!patterns.some((p) => p.test(s))) return false;
  const d = new Date(s);
  return !isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100;
}

function buildActionDescription(
  type: string,
  options: CleaningOptions,
  missingCount: number,
  invalidCount: number,
): string {
  const actions: string[] = [];

  if (options.trimWhitespace) actions.push('Espacios normalizados');
  if (type === 'categorical' && options.normalizeCase !== 'none') {
    actions.push(`Texto convertido a ${options.normalizeCase === 'lower' ? 'minúsculas' : 'mayúsculas'}`);
  }
  if (missingCount > 0) {
    if (options.removeEmptyRows || options.removeIncompleteRows) {
      actions.push(`${missingCount} vacíos detectados (filas con todos vacíos eliminadas)`);
    } else {
      actions.push(`${missingCount} vacíos detectados (no eliminados)`);
    }
  }
  if (invalidCount > 0 && options.fixDates && type === 'temporal') {
    actions.push(`${invalidCount} fechas normalizadas`);
  }
  if (options.imputeNumericStrategy !== 'none' && (type === 'monetary' || type === 'quantity')) {
    actions.push(`Vacíos imputados con ${options.imputeNumericStrategy === 'mean' ? 'promedio' : 'mediana'}`);
  }

  return actions.length > 0 ? actions.join('. ') : 'Sin cambios necesarios';
}
