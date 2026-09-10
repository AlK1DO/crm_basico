/**
 * chartSelector.ts
 *
 * Recomienda el tipo de gráfico apropiado para cada pregunta analítica.
 * Cada gráfico responde una pregunta específica.
 */

import type { ColumnInfo } from '../types';

export type RecommendedChart =
  | 'line'       // evolución temporal — ¿Cómo evoluciona?
  | 'bar'        // comparación/ranking — ¿Cuál es mayor?
  | 'pie'        // distribución parte-del-todo — ¿Qué proporción?
  | 'scatter'    // relación entre dos variables numéricas
  | 'grouped_bar' // comparación entre dos grupos
  | 'none';      // no hay suficientes datos

export interface ChartRecommendation {
  type: RecommendedChart;
  question: string;
  reason: string;
  xAxis: string;
  yAxis: string;
}

// ─── Paleta de colores central ────────────────────────────────────────────────

/** Paleta reutilizable para todos los gráficos del sistema. */
export const CHART_PALETTE = {
  primary:   '#3b82f6', // azul principal
  success:   '#10b981', // verde positivo
  warning:   '#f59e0b', // naranja advertencia
  danger:    '#ef4444', // rojo negativo
  purple:    '#8b5cf6',
  teal:      '#14b8a6',
  pink:      '#ec4899',
  indigo:    '#6366f1',
  gray:      '#6b7280',
  dark:      '#111827',
};

/** Escala de colores para gráficos multi-categoría. */
export const CATEGORY_COLORS = [
  '#3b82f6', // azul
  '#10b981', // verde
  '#f59e0b', // naranja
  '#8b5cf6', // morado
  '#ef4444', // rojo
  '#14b8a6', // teal
  '#ec4899', // rosa
  '#6366f1', // índigo
  '#f97316', // naranja fuerte
  '#06b6d4', // celeste
];

/** Color semántico según dirección del cambio. */
export function directionColor(direction: 'up' | 'down' | 'flat'): string {
  if (direction === 'up') return CHART_PALETTE.success;
  if (direction === 'down') return CHART_PALETTE.danger;
  return CHART_PALETTE.gray;
}

// ─── Recomendador de gráficos ─────────────────────────────────────────────────

/**
 * Dados dos columnas y el contexto, recomienda el gráfico más apropiado.
 */
export function recommendChart(
  colA: ColumnInfo | null,
  colB: ColumnInfo | null,
  rowCount: number,
): ChartRecommendation {
  if (!colA || !colB || rowCount < 2) {
    return {
      type: 'none',
      question: '—',
      reason: 'Datos insuficientes para recomendar un gráfico.',
      xAxis: '',
      yAxis: '',
    };
  }

  // Temporal + Monetario → línea de tendencia
  if (colA.type === 'temporal' && (colB.type === 'monetary' || colB.type === 'quantity')) {
    return {
      type: 'line',
      question: `¿Cómo evolucionan las ${colB.friendlyName} en el tiempo?`,
      reason: 'Una línea muestra la evolución de valores numéricos a lo largo del tiempo.',
      xAxis: colA.name,
      yAxis: colB.name,
    };
  }
  if (colB.type === 'temporal' && (colA.type === 'monetary' || colA.type === 'quantity')) {
    return {
      type: 'line',
      question: `¿Cómo evolucionan las ${colA.friendlyName} en el tiempo?`,
      reason: 'Una línea muestra la evolución de valores numéricos a lo largo del tiempo.',
      xAxis: colB.name,
      yAxis: colA.name,
    };
  }

  // Categórico + Monetario → barras de ranking
  if (colA.type === 'categorical' && (colB.type === 'monetary' || colB.type === 'quantity')) {
    return {
      type: 'bar',
      question: `¿Cuál ${colA.friendlyName} tiene mayor ${colB.friendlyName}?`,
      reason: 'Las barras son ideales para comparar valores entre categorías distintas.',
      xAxis: colA.name,
      yAxis: colB.name,
    };
  }
  if (colB.type === 'categorical' && (colA.type === 'monetary' || colA.type === 'quantity')) {
    return {
      type: 'bar',
      question: `¿Cuál ${colB.friendlyName} tiene mayor ${colA.friendlyName}?`,
      reason: 'Las barras son ideales para comparar valores entre categorías distintas.',
      xAxis: colB.name,
      yAxis: colA.name,
    };
  }

  // Dos numéricos → scatter (relación)
  if (
    (colA.type === 'monetary' || colA.type === 'quantity') &&
    (colB.type === 'monetary' || colB.type === 'quantity')
  ) {
    return {
      type: 'scatter',
      question: `¿Existe relación entre ${colA.friendlyName} y ${colB.friendlyName}?`,
      reason: 'El scatter permite visualizar la correlación entre dos variables numéricas.',
      xAxis: colA.name,
      yAxis: colB.name,
    };
  }

  // Categórico solo → pie (distribución)
  if (colA.type === 'categorical') {
    return {
      type: 'pie',
      question: `¿Cómo se distribuye ${colA.friendlyName}?`,
      reason: 'El pie muestra la proporción de cada categoría en el total.',
      xAxis: colA.name,
      yAxis: '',
    };
  }

  // Default: barras
  return {
    type: 'bar',
    question: `Comparación de ${colA.friendlyName} por ${colB.friendlyName}`,
    reason: 'Las barras permiten comparar valores entre etiquetas.',
    xAxis: colB.name,
    yAxis: colA.name,
  };
}

/** Formatea el número para mostrar en tooltip de gráfico. */
export function formatTooltipValue(value: number, currency = ''): string {
  const formatted = value.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}
