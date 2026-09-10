/**
 * anomalyDetector.ts
 *
 * Detecta anomalías estadísticas en series y distribuciones.
 * Usa z-score e IQR para identificar outliers.
 * Solo reporta hechos — no infiere causas.
 */

import type { Anomaly, TrendPoint } from '../types';
import { parseNumeric } from './metricsCalculator';

// ─── Outliers en distribución ─────────────────────────────────────────────────

/**
 * Detecta outliers en una columna numérica usando IQR.
 * Retorna los valores con su etiqueta (de otra columna) para identificarlos.
 */
export function detectOutliers(
  rows: Record<string, string>[],
  valueCol: string,
  labelCol?: string,
  maxResults = 5,
): Anomaly[] {
  const entries: Array<{ label: string; value: number }> = [];

  for (const row of rows) {
    const v = parseNumeric(row[valueCol]);
    if (v === null) continue;
    const label = labelCol ? String(row[labelCol] ?? '').trim() : `fila ${entries.length + 1}`;
    entries.push({ label, value: v });
  }

  if (entries.length < 4) return [];

  const values = entries.map((e) => e.value).sort((a, b) => a - b);
  const q1 = percentile(values, 25);
  const q3 = percentile(values, 75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  const anomalies: Anomaly[] = entries
    .filter((e) => e.value < lowerFence || e.value > upperFence)
    .slice(0, maxResults)
    .map((e) => ({
      type: 'outlier' as const,
      label: e.label,
      value: e.value,
      expectedRange: [lowerFence, upperFence],
      severity: getSeverity(e.value, lowerFence, upperFence, iqr),
    }));

  return anomalies;
}

/**
 * Detecta picos y caídas abruptas en una serie temporal.
 */
export function detectSpikesAndDrops(
  series: TrendPoint[],
  threshold = 0.30, // 30% de cambio relativo
): Anomaly[] {
  if (series.length < 3) return [];

  const anomalies: Anomaly[] = [];
  const values = series.map((p) => p.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / values.length);

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].value;
    const curr = series[i].value;

    if (prev === 0) continue;

    const changePct = Math.abs((curr - prev) / prev);
    if (changePct < threshold) continue;

    const type = curr > prev ? 'spike' as const : 'drop' as const;
    const severity = changePct > 0.6 ? 'high' as const : changePct > 0.4 ? 'medium' as const : 'low' as const;

    anomalies.push({
      type,
      label: series[i].label,
      value: curr,
      expectedRange: [avg - std, avg + std],
      severity,
    });
  }

  return anomalies;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function percentile(sortedArr: number[], p: number): number {
  const idx = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedArr[lower];
  return sortedArr[lower] + (idx - lower) * (sortedArr[upper] - sortedArr[lower]);
}

function getSeverity(
  value: number,
  lower: number,
  upper: number,
  iqr: number,
): 'low' | 'medium' | 'high' {
  const deviation = value < lower
    ? (lower - value) / iqr
    : (value - upper) / iqr;

  if (deviation > 3) return 'high';
  if (deviation > 1.5) return 'medium';
  return 'low';
}

/**
 * Detecta concentración: si pocas categorías representan la mayoría del total.
 * Retorna la proporción cubierta por el top N.
 */
export function detectConcentration(
  totals: Array<{ name: string; total: number }>,
  topN = 5,
): { topN: number; topNames: string[]; sharePercent: number } {
  const sorted = [...totals].sort((a, b) => b.total - a.total);
  const grandTotal = sorted.reduce((acc, v) => acc + v.total, 0);
  if (grandTotal === 0) return { topN, topNames: [], sharePercent: 0 };

  const top = sorted.slice(0, topN);
  const topTotal = top.reduce((acc, v) => acc + v.total, 0);

  return {
    topN: top.length,
    topNames: top.map((v) => v.name),
    sharePercent: (topTotal / grandTotal) * 100,
  };
}
