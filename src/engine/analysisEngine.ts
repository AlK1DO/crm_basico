/**
 * analysisEngine.ts
 *
 * Motor analítico central del CRM.
 * Orquesta: detección de columnas → métricas → tendencias → anomalías → insights.
 *
 * Uso:
 *   const result = analyzeDataset(dataset, filters);
 *   // result.metrics, result.insights, result.trends, etc.
 *
 * Los módulos (Ventas, Reportes, Dashboard) consumen este resultado.
 * No calculan métricas por su cuenta.
 */

import type { Dataset } from '../types';
import type { AnalysisResult } from '../types';
import { detectColumns, findColumnByType } from './columnDetector';
import {
  calculateSalesMetrics,
  groupByCategory,
  buildTimeSeries,
  detectTemporalGranularity,
  parseNumeric,
  isMissing,
} from './metricsCalculator';
import {
  compareLastPeriods,
  getAllPeriodComparisons,
} from './trendDetector';
import {
  detectSpikesAndDrops,
  detectOutliers,
} from './anomalyDetector';
import {
  buildTrendInsight,
  buildPeriodComparisonInsight,
  buildConcentrationInsight,
  buildDominantInsight,
  buildAboveBelowAverageInsight,
  buildWorstPerformerInsight,
  buildAnomalyInsight,
  buildDataQualityInsight,
  buildAvgValueInsight,
  buildDiscountGroupInsight,
  sortInsightsByPriority,
  deduplicateInsights,
  hasTicketIdentifier,
  findDiscountColumn,
} from './insightEngine';

// ─── Filtros opcionales ───────────────────────────────────────────────────────

export interface AnalysisFilters {
  categoryFilter?: string;   // filtrar por valor en columna de categoría
  periodStart?: string;      // filtrar desde fecha (ISO)
  periodEnd?: string;        // filtrar hasta fecha (ISO)
  useCleanRows?: boolean;    // usar datos limpios si están disponibles
}

// ─── Motor principal ──────────────────────────────────────────────────────────

export function analyzeDataset(
  dataset: Dataset,
  filters: AnalysisFilters = {},
): AnalysisResult {
  const { useCleanRows = true } = filters;

  // Usar datos limpios si existen y se solicita
  const rows = (useCleanRows && dataset.cleanRows !== null)
    ? dataset.cleanRows
    : dataset.rows;

  // Detectar columnas si no están ya en el dataset
  const columnInfo = dataset.columnInfo.length > 0
    ? dataset.columnInfo
    : detectColumns(dataset.columns, rows);

  const detectedColumns = {
    monetary:  findColumnByType(columnInfo, 'monetary'),
    quantity:  findColumnByType(columnInfo, 'quantity'),
    temporal:  findColumnByType(columnInfo, 'temporal'),
    product:   columnInfo.find((c) => c.type === 'categorical' && isProductLike(c.name))?.name ?? findColumnByType(columnInfo, 'categorical'),
    category:  findColumnByType(columnInfo, 'categorical'),
  };

  const warnings: string[] = [];

  if (!detectedColumns.monetary) {
    warnings.push('No se identificó una columna compatible con ventas/montos. Los KPIs monetarios no estarán disponibles.');
  }
  if (!detectedColumns.temporal) {
    warnings.push('No se encontró una columna temporal válida. El análisis de tendencias no estará disponible.');
  }

  // Aplicar filtros a las filas
  let filteredRows = applyFilters(rows, detectedColumns, filters);

  if (filteredRows.length === 0 && rows.length > 0) {
    warnings.push('Los filtros aplicados resultaron en un dataset vacío. Mostrando todos los datos.');
    filteredRows = rows;
  }

  // ── Métricas ──────────────────────────────────────────────────────────────

  const metrics = calculateSalesMetrics(
    filteredRows,
    detectedColumns.monetary,
    detectedColumns.quantity,
  );

  // Producto y categoría top
  if (detectedColumns.product && detectedColumns.monetary) {
    const byProduct = groupByCategory(filteredRows, detectedColumns.product, detectedColumns.monetary, null);
    if (byProduct.length > 0) metrics.topProduct = byProduct[0].name;
  }
  if (detectedColumns.category && detectedColumns.monetary && detectedColumns.category !== detectedColumns.product) {
    const byCat = groupByCategory(filteredRows, detectedColumns.category, detectedColumns.monetary, null);
    if (byCat.length > 0) metrics.topCategory = byCat[0].name;
  }

  // ── Desglose por categoría ────────────────────────────────────────────────

  const categoryCol = detectedColumns.category ?? detectedColumns.product;
  const categoryBreakdown = categoryCol
    ? groupByCategory(filteredRows, categoryCol, detectedColumns.monetary, detectedColumns.quantity)
    : [];

  // ── Serie temporal ────────────────────────────────────────────────────────

  let trends: ReturnType<typeof buildTimeSeries> = [];
  if (detectedColumns.temporal && detectedColumns.monetary) {
    const granularity = detectTemporalGranularity(filteredRows, detectedColumns.temporal);
    trends = buildTimeSeries(filteredRows, detectedColumns.temporal, detectedColumns.monetary, granularity);
  }

  // ── Comparaciones de períodos ─────────────────────────────────────────────

  const lastPeriodComp = compareLastPeriods(trends);
  const periodComparisons = trends.length >= 2 ? getAllPeriodComparisons(trends, 3) : [];

  // ── Anomalías ─────────────────────────────────────────────────────────────

  const anomalies = [
    ...detectSpikesAndDrops(trends, 0.30),
    ...(detectedColumns.monetary
      ? detectOutliers(filteredRows, detectedColumns.monetary, detectedColumns.product ?? undefined, 3)
      : []),
  ].slice(0, 5);

  // ── Calidad de datos ──────────────────────────────────────────────────────

  const { qualityPct, missingCount } = estimateDataQuality(rows, detectedColumns.monetary);

  // ── Contexto extra para insights ──────────────────────────────────────────

  const ticketCol = hasTicketIdentifier(filteredRows, dataset.columns);
  const discountCol = findDiscountColumn(dataset.columns);

  // ── Insights ──────────────────────────────────────────────────────────────

  const entityName = isProductLike(categoryCol ?? '') ? 'productos' : 'categorías';

  const rawInsights = [
    // Calidad primero — si es mala los demás insights son menos fiables
    buildDataQualityInsight(qualityPct, missingCount, rows.length),

    // Tendencia temporal — SOLO si existe serie con ≥3 puntos
    trends.length >= 3 ? buildTrendInsight(trends, lastPeriodComp) : null,

    // Comparación último período — SOLO si hay fecha
    lastPeriodComp ? buildPeriodComparisonInsight(lastPeriodComp) : null,

    // Concentración en top N (sin fecha requerida)
    categoryBreakdown.length >= 3
      ? buildConcentrationInsight(categoryBreakdown, entityName)
      : null,

    // Líder dominante consolidado (sin repetir en concentración)
    categoryBreakdown.length >= 2
      ? buildDominantInsight(categoryBreakdown, entityName.slice(0, -1))
      : null,

    // Distribución above/below promedio (sin fecha requerida)
    categoryBreakdown.length >= 4
      ? buildAboveBelowAverageInsight(categoryBreakdown, entityName)
      : null,

    // Peor performer (sin duplicar el líder)
    categoryBreakdown.length >= 3
      ? buildWorstPerformerInsight(categoryBreakdown)
      : null,

    // Comparación con/sin descuento — solo si existe columna de descuento
    discountCol && detectedColumns.monetary
      ? buildDiscountGroupInsight(
          filteredRows,
          detectedColumns.monetary,
          discountCol,
          detectedColumns.quantity,
        )
      : null,

    // Valor promedio por registro (con label correcto según si hay ticket_id)
    buildAvgValueInsight(metrics, ticketCol),

    // Anomalías (máx 2)
    ...anomalies.slice(0, 2).map(buildAnomalyInsight),
  ].filter((i): i is NonNullable<typeof i> => i !== null);

  const insights = deduplicateInsights(sortInsightsByPriority(rawInsights));

  return {
    datasetId: dataset.id,
    detectedColumns,
    metrics,
    trends,
    categoryBreakdown,
    periodComparisons,
    anomalies,
    insights,
    warnings,
    generatedAt: new Date(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyFilters(
  rows: Record<string, string>[],
  cols: AnalysisResult['detectedColumns'],
  filters: AnalysisFilters,
): Record<string, string>[] {
  let result = rows;

  if (filters.categoryFilter && cols.category) {
    const filterVal = filters.categoryFilter.toLowerCase().trim();
    result = result.filter(
      (r) => String(r[cols.category!] ?? '').toLowerCase().trim() === filterVal
    );
  }

  // Filtro de período: solo si hay columna temporal
  if ((filters.periodStart || filters.periodEnd) && cols.temporal) {
    result = result.filter((r) => {
      const raw = r[cols.temporal!];
      if (isMissing(raw)) return false;
      try {
        const d = new Date(raw);
        if (isNaN(d.getTime())) return true; // no parseable → incluir
        if (filters.periodStart && d < new Date(filters.periodStart)) return false;
        if (filters.periodEnd && d > new Date(filters.periodEnd)) return false;
        return true;
      } catch {
        return true;
      }
    });
  }

  return result;
}

function estimateDataQuality(
  rows: Record<string, string>[],
  monetaryCol: string | null,
): { qualityPct: number; missingCount: number } {
  if (rows.length === 0) return { qualityPct: 100, missingCount: 0 };
  if (!monetaryCol) return { qualityPct: 100, missingCount: 0 };

  const missing = rows.filter((r) => {
    const v = r[monetaryCol];
    return isMissing(v) || parseNumeric(v) === null;
  }).length;

  const qualityPct = ((rows.length - missing) / rows.length) * 100;
  return { qualityPct, missingCount: missing };
}

function isProductLike(colName: string): boolean {
  const n = colName.toLowerCase();
  return ['producto', 'product', 'medicamento', 'item', 'descripcion', 'description',
    'articulo', 'nombre', 'farmaco', 'presentacion'].some((k) => n.includes(k));
}
