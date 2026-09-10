/**
 * trendDetector.ts
 *
 * Detecta tendencias y compara períodos en series temporales.
 * Solo describe hechos observados — no infiere causas.
 */

import type { PeriodComparison, TrendPoint } from '../types';

// ─── Comparación de períodos ──────────────────────────────────────────────────

/**
 * Compara el último período con el anterior en una serie temporal.
 * Requiere al menos 2 puntos para funcionar.
 */
export function compareLastPeriods(
  series: TrendPoint[],
): PeriodComparison | null {
  if (series.length < 2) return null;

  const last = series[series.length - 1];
  const prev = series[series.length - 2];

  const change = last.value - prev.value;
  const changePct = prev.value !== 0 ? (change / prev.value) * 100 : 0;

  return {
    periodA: prev.label,
    periodB: last.label,
    totalA: prev.value,
    totalB: last.value,
    change,
    changePct,
    direction: change > 0.01 ? 'up' : change < -0.01 ? 'down' : 'flat',
  };
}

/**
 * Compara la primera mitad del dataset con la segunda mitad.
 * Útil cuando no hay columna temporal clara.
 */
export function compareHalves(
  series: TrendPoint[],
): PeriodComparison | null {
  if (series.length < 4) return null;

  const mid = Math.floor(series.length / 2);
  const firstHalf = series.slice(0, mid);
  const secondHalf = series.slice(mid);

  const sumFirst = firstHalf.reduce((acc, p) => acc + p.value, 0);
  const sumSecond = secondHalf.reduce((acc, p) => acc + p.value, 0);

  const change = sumSecond - sumFirst;
  const changePct = sumFirst !== 0 ? (change / sumFirst) * 100 : 0;

  return {
    periodA: `Primera mitad (${firstHalf[0].label} – ${firstHalf[firstHalf.length - 1].label})`,
    periodB: `Segunda mitad (${secondHalf[0].label} – ${secondHalf[secondHalf.length - 1].label})`,
    totalA: sumFirst,
    totalB: sumSecond,
    change,
    changePct,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  };
}

/**
 * Detecta si una serie temporal tiene tendencia al alza, baja o plana.
 * Usa regresión lineal simple.
 */
export function detectOverallTrend(
  series: TrendPoint[],
): { slope: number; direction: 'up' | 'down' | 'flat'; strength: 'strong' | 'moderate' | 'weak' } {
  if (series.length < 3) {
    return { slope: 0, direction: 'flat', strength: 'weak' };
  }

  const n = series.length;
  const xs = series.map((_, i) => i);
  const ys = series.map((p) => p.value);

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const avgY = sumY / n;

  // Normalizar pendiente como porcentaje del promedio
  const relativeSlopePerStep = avgY !== 0 ? (slope / avgY) * 100 : 0;

  const direction = relativeSlopePerStep > 1 ? 'up' : relativeSlopePerStep < -1 ? 'down' : 'flat';
  const absSlope = Math.abs(relativeSlopePerStep);
  const strength = absSlope > 10 ? 'strong' : absSlope > 3 ? 'moderate' : 'weak';

  return { slope, direction, strength };
}

/**
 * Compara todas las combinaciones de períodos consecutivos en la serie.
 * Devuelve las N comparaciones más significativas.
 */
export function getAllPeriodComparisons(
  series: TrendPoint[],
  maxComparisons = 3,
): PeriodComparison[] {
  if (series.length < 2) return [];

  const comparisons: PeriodComparison[] = [];

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const curr = series[i];
    const change = curr.value - prev.value;
    const changePct = prev.value !== 0 ? (change / prev.value) * 100 : 0;

    comparisons.push({
      periodA: prev.label,
      periodB: curr.label,
      totalA: prev.value,
      totalB: curr.value,
      change,
      changePct,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    });
  }

  // Ordenar por magnitud de cambio absoluto y devolver los más significativos
  return comparisons
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, maxComparisons);
}
