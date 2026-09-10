/**
 * metricsCalculator.ts
 *
 * Calcula KPIs de ventas a partir de filas limpias y columnas detectadas.
 * Todos los cálculos son sobre datos reales — nunca inventa valores.
 */

import type { SalesMetrics, CategoryBreakdown, TrendPoint } from '../types';

// ─── Valores considerados ausentes/inválidos ──────────────────────────────────

export const MISSING_VALUES = new Set([
  '', ' ', '  ', 'n/a', 'na', 'null', 'undefined', '-', 'none', 'nan',
]);

export function isMissing(value: string | null | undefined): boolean {
  if (value == null) return true;
  return MISSING_VALUES.has(value.trim().toLowerCase());
}

export function parseNumeric(value: string | null | undefined): number | null {
  if (isMissing(value)) return null;
  const cleaned = String(value).replace(/,/g, '.').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// ─── Métricas principales ─────────────────────────────────────────────────────

export function calculateSalesMetrics(
  rows: Record<string, string>[],
  monetaryCol: string | null,
  quantityCol: string | null,
): SalesMetrics {
  if (!monetaryCol) {
    return {
      totalAmount: 0,
      totalUnits: 0,
      avgTicket: 0,
      transactionCount: rows.length,
      topProduct: null,
      topCategory: null,
      currency: '',
    };
  }

  let totalAmount = 0;
  let totalUnits = 0;
  let validAmounts = 0;

  for (const row of rows) {
    const amount = parseNumeric(row[monetaryCol]);
    if (amount !== null && amount >= 0) {
      totalAmount += amount;
      validAmounts++;
    }

    if (quantityCol) {
      const qty = parseNumeric(row[quantityCol]);
      if (qty !== null && qty >= 0) totalUnits += qty;
    }
  }

  const avgTicket = validAmounts > 0 ? totalAmount / validAmounts : 0;

  return {
    totalAmount,
    totalUnits,
    avgTicket,
    transactionCount: rows.length,
    topProduct: null,     // se llena en analysisEngine
    topCategory: null,    // se llena en analysisEngine
    currency: inferCurrency(rows, monetaryCol),
  };
}

/** Agrupa por una columna categórica y suma el monetario. */
export function groupByCategory(
  rows: Record<string, string>[],
  categoryCol: string,
  monetaryCol: string | null,
  quantityCol: string | null,
): CategoryBreakdown[] {
  const map = new Map<string, { total: number; units: number; count: number }>();

  for (const row of rows) {
    const key = String(row[categoryCol] ?? '').trim() || '(sin valor)';
    if (!map.has(key)) map.set(key, { total: 0, units: 0, count: 0 });
    const entry = map.get(key)!;

    entry.count++;

    if (monetaryCol) {
      const amount = parseNumeric(row[monetaryCol]);
      if (amount !== null && amount >= 0) entry.total += amount;
    }

    if (quantityCol) {
      const qty = parseNumeric(row[quantityCol]);
      if (qty !== null && qty >= 0) entry.units += qty;
    }
  }

  const grandTotal = [...map.values()].reduce((acc, v) => acc + v.total, 0);

  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      total: v.total,
      units: v.units,
      share: grandTotal > 0 ? (v.total / grandTotal) * 100 : 0,
      count: v.count,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Construye serie temporal agrupando por la columna de fecha (día/mes). */
export function buildTimeSeries(
  rows: Record<string, string>[],
  temporalCol: string,
  monetaryCol: string | null,
  granularity: 'day' | 'month' | 'year' = 'month',
): TrendPoint[] {
  const map = new Map<string, { sum: number; count: number }>();

  for (const row of rows) {
    const rawDate = row[temporalCol];
    if (isMissing(rawDate)) continue;

    const label = formatDateLabel(rawDate, granularity);
    if (!label) continue;

    if (!map.has(label)) map.set(label, { sum: 0, count: 0 });
    const entry = map.get(label)!;
    entry.count++;

    if (monetaryCol) {
      const amount = parseNumeric(row[monetaryCol]);
      if (amount !== null && amount >= 0) entry.sum += amount;
    }
  }

  // Ordenar cronológicamente
  const points: TrendPoint[] = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, v]) => ({ label, value: v.sum }));

  // Agregar media móvil de 3 puntos
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p;
    const avg = (points[i - 1].value + p.value + points[i + 1].value) / 3;
    return { ...p, movingAvg: avg };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateLabel(raw: string, granularity: 'day' | 'month' | 'year'): string | null {
  const s = raw.trim();

  // Intentar parsear la fecha
  let date: Date | null = null;

  // ISO: 2024-01-15
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    date = new Date(s.slice(0, 10));
  }
  // DD/MM/YYYY
  else if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [d, m, y] = s.split('/');
    date = new Date(`${y}-${m}-${d}`);
  }
  // DD-MM-YYYY
  else if (/^\d{2}-\d{2}-\d{4}/.test(s)) {
    const [d, m, y] = s.split('-');
    date = new Date(`${y}-${m}-${d}`);
  }
  // YYYY/MM/DD
  else if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) {
    date = new Date(s.replace(/\//g, '-'));
  }
  // Intentar Date general como último recurso
  else {
    const d = new Date(s);
    if (!isNaN(d.getTime())) date = d;
  }

  if (!date || isNaN(date.getTime())) return null;

  if (granularity === 'year') {
    return `${date.getFullYear()}`;
  }
  if (granularity === 'month') {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }
  // day
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function inferCurrency(rows: Record<string, string>[], col: string): string {
  // Buscar símbolo en los primeros valores
  const sample = rows.slice(0, 5).map((r) => String(r[col] ?? ''));
  if (sample.some((v) => v.includes('S/'))) return 'S/';
  if (sample.some((v) => v.includes('$'))) return '$';
  if (sample.some((v) => v.includes('€'))) return '€';
  return '';
}

/** Determina la granularidad apropiada según el rango de fechas del dataset. */
export function detectTemporalGranularity(
  rows: Record<string, string>[],
  temporalCol: string,
): 'day' | 'month' | 'year' {
  const dates: Date[] = [];

  for (const row of rows) {
    const raw = row[temporalCol];
    if (isMissing(raw)) continue;

    let d: Date | null = null;
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s.slice(0, 10));
    else if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
      const [day, m, y] = s.split('/');
      d = new Date(`${y}-${m}-${day}`);
    } else {
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) d = parsed;
    }

    if (d && !isNaN(d.getTime())) dates.push(d);
  }

  if (dates.length < 2) return 'day';

  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  const daysDiff = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysDiff <= 31) return 'day';
  if (daysDiff <= 365 * 3) return 'month';
  return 'year';
}
