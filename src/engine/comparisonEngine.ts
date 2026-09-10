/**
 * comparisonEngine.ts
 *
 * Motor de comparación entre dos datasets.
 * Compara KPIs, distribuciones por categoría/producto y genera insights
 * automáticos sobre las diferencias encontradas.
 *
 * No depende de columna temporal — funciona con cualquier dataset.
 * Si ambos tienen fecha, también compara tendencias.
 */

import type { Dataset, CategoryBreakdown, Insight, InsightPriority } from '../types';
import { analyzeDataset } from './analysisEngine';
import { groupByCategory, parseNumeric } from './metricsCalculator';
import { fmtNum } from './insightEngine';
import { findColumnByType } from './columnDetector';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DatasetKPIs {
  totalAmount: number;
  totalUnits: number;
  avgValue: number;
  transactionCount: number;
  topProduct: string | null;
  topCategory: string | null;
  currency: string;
}

export interface KPIDiff {
  label: string;
  valueA: number | string;
  valueB: number | string;
  diffPct: number | null;   // null si no es comparable numéricamente
  direction: 'up' | 'down' | 'flat' | 'none';
}

export interface CategoryComparison {
  name: string;
  totalA: number;
  totalB: number;
  shareA: number;
  shareB: number;
  diffAbs: number;
  diffPct: number;
  direction: 'up' | 'down' | 'flat';
  onlyInA: boolean;
  onlyInB: boolean;
}

export interface ComparisonResult {
  datasetAId: string;
  datasetBId: string;
  datasetAName: string;
  datasetBName: string;
  kpiDiffs: KPIDiff[];
  categoryComparisons: CategoryComparison[];  // productos/categorías comunes y exclusivos
  topGainers: CategoryComparison[];           // top 5 mayor crecimiento
  topLosers: CategoryComparison[];            // top 5 mayor caída
  onlyInA: CategoryComparison[];              // presentes solo en A
  onlyInB: CategoryComparison[];              // presentes solo en B
  insights: Insight[];
  warnings: string[];
  generatedAt: Date;
}

// ─── Motor principal ──────────────────────────────────────────────────────────

export function compareDatasets(
  datasetA: Dataset,
  datasetB: Dataset,
  useCleanRows = true,
): ComparisonResult {
  const warnings: string[] = [];

  const rowsA = (useCleanRows && datasetA.cleanRows) ? datasetA.cleanRows : datasetA.rows;
  const rowsB = (useCleanRows && datasetB.cleanRows) ? datasetB.cleanRows : datasetB.rows;

  // Analizar ambos para obtener columnas detectadas
  const analysisA = analyzeDataset(datasetA, { useCleanRows });
  const analysisB = analyzeDataset(datasetB, { useCleanRows });

  const colMonA = analysisA.detectedColumns.monetary;
  const colMonB = analysisB.detectedColumns.monetary;
  const colQtyA = analysisA.detectedColumns.quantity;
  const colQtyB = analysisB.detectedColumns.quantity;

  // Columna categórica común (producto o categoría)
  const colCatA = analysisA.detectedColumns.product ?? analysisA.detectedColumns.category;
  const colCatB = analysisB.detectedColumns.product ?? analysisB.detectedColumns.category;

  if (!colMonA || !colMonB) {
    warnings.push('Uno o ambos datasets no tienen columna de ventas/montos. Los KPIs monetarios no estarán disponibles.');
  }
  if (!colCatA || !colCatB) {
    warnings.push('Uno o ambos datasets no tienen columna de producto/categoría. La comparación por categoría no estará disponible.');
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const metricsA = analysisA.metrics;
  const metricsB = analysisB.metrics;

  const kpiDiffs: KPIDiff[] = [];

  if (metricsA && metricsB) {
    kpiDiffs.push(makeNumericDiff('Ventas totales', metricsA.totalAmount, metricsB.totalAmount, metricsA.currency));
    kpiDiffs.push(makeNumericDiff('Transacciones', metricsA.transactionCount, metricsB.transactionCount));
    if (metricsA.totalUnits > 0 || metricsB.totalUnits > 0) {
      kpiDiffs.push(makeNumericDiff('Unidades vendidas', metricsA.totalUnits, metricsB.totalUnits));
    }
    if (metricsA.avgTicket > 0 || metricsB.avgTicket > 0) {
      kpiDiffs.push(makeNumericDiff('Valor promedio', metricsA.avgTicket, metricsB.avgTicket, metricsA.currency));
    }
    // Producto top
    kpiDiffs.push({
      label: 'Producto líder',
      valueA: metricsA.topProduct ?? '—',
      valueB: metricsB.topProduct ?? '—',
      diffPct: null,
      direction: 'none',
    });
  }

  // ── Comparación por categoría/producto ────────────────────────────────────

  let categoryComparisons: CategoryComparison[] = [];

  if (colCatA && colCatB && colMonA && colMonB) {
    const byA = groupByCategory(rowsA, colCatA, colMonA, colQtyA);
    const byB = groupByCategory(rowsB, colCatB, colMonB, colQtyB);

    const totalA = byA.reduce((acc, c) => acc + c.total, 0);
    const totalB = byB.reduce((acc, c) => acc + c.total, 0);

    const mapA = new Map(byA.map((c) => [c.name.toLowerCase().trim(), c]));
    const mapB = new Map(byB.map((c) => [c.name.toLowerCase().trim(), c]));

    const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);

    for (const key of allKeys) {
      const a = mapA.get(key);
      const b = mapB.get(key);

      const tA = a?.total ?? 0;
      const tB = b?.total ?? 0;
      const sA = totalA > 0 ? (tA / totalA) * 100 : 0;
      const sB = totalB > 0 ? (tB / totalB) * 100 : 0;
      const diffAbs = tB - tA;
      const diffPct = tA > 0 ? ((tB - tA) / tA) * 100 : tB > 0 ? 100 : 0;

      categoryComparisons.push({
        name: a?.name ?? b?.name ?? key,
        totalA: tA,
        totalB: tB,
        shareA: sA,
        shareB: sB,
        diffAbs,
        diffPct,
        direction: diffAbs > 0.01 ? 'up' : diffAbs < -0.01 ? 'down' : 'flat',
        onlyInA: !b,
        onlyInB: !a,
      });
    }

    // Ordenar por valor absoluto de cambio desc
    categoryComparisons.sort((a, b) => Math.abs(b.diffAbs) - Math.abs(a.diffAbs));
  }

  const topGainers = [...categoryComparisons]
    .filter((c) => !c.onlyInA && !c.onlyInB && c.diffPct > 0)
    .sort((a, b) => b.diffPct - a.diffPct)
    .slice(0, 5);

  const topLosers = [...categoryComparisons]
    .filter((c) => !c.onlyInA && !c.onlyInB && c.diffPct < 0)
    .sort((a, b) => a.diffPct - b.diffPct)
    .slice(0, 5);

  const onlyInA = categoryComparisons.filter((c) => c.onlyInA).slice(0, 5);
  const onlyInB = categoryComparisons.filter((c) => c.onlyInB).slice(0, 5);

  // ── Insights automáticos ──────────────────────────────────────────────────

  const insights = buildComparisonInsights({
    datasetAName: datasetA.name,
    datasetBName: datasetB.name,
    metricsA,
    metricsB,
    topGainers,
    topLosers,
    onlyInA,
    onlyInB,
    categoryComparisons,
    warnings,
  });

  return {
    datasetAId: datasetA.id,
    datasetBId: datasetB.id,
    datasetAName: datasetA.name,
    datasetBName: datasetB.name,
    kpiDiffs,
    categoryComparisons: categoryComparisons.slice(0, 20),
    topGainers,
    topLosers,
    onlyInA,
    onlyInB,
    insights,
    warnings,
    generatedAt: new Date(),
  };
}

// ─── Generadores de insights de comparación ───────────────────────────────────

function buildComparisonInsights(ctx: {
  datasetAName: string;
  datasetBName: string;
  metricsA: ReturnType<typeof analyzeDataset>['metrics'];
  metricsB: ReturnType<typeof analyzeDataset>['metrics'];
  topGainers: CategoryComparison[];
  topLosers: CategoryComparison[];
  onlyInA: CategoryComparison[];
  onlyInB: CategoryComparison[];
  categoryComparisons: CategoryComparison[];
  warnings: string[];
}): Insight[] {
  const insights: Insight[] = [];
  const nameA = shortName(ctx.datasetAName);
  const nameB = shortName(ctx.datasetBName);
  let idCounter = 0;
  const id = () => `cmp_${++idCounter}_${Date.now()}`;

  const mA = ctx.metricsA;
  const mB = ctx.metricsB;

  // 1. Comparación de ventas totales
  if (mA && mB && mA.totalAmount > 0 && mB.totalAmount > 0) {
    const diffPct = ((mB.totalAmount - mA.totalAmount) / mA.totalAmount) * 100;
    const isUp = diffPct > 0;
    const absDiff = Math.abs(diffPct);

    const priority: InsightPriority =
      absDiff > 30 ? (isUp ? 'important' : 'critical') :
      absDiff > 10 ? (isUp ? 'opportunity' : 'important') : 'informative';

    if (absDiff >= 1) {
      insights.push({
        id: id(),
        type: 'comparison',
        priority,
        title: isUp
          ? `${nameB} supera a ${nameA} en ventas totales en ${absDiff.toFixed(1)}%`
          : `${nameB} está por debajo de ${nameA} en ventas totales en ${absDiff.toFixed(1)}%`,
        fact: `Las ventas totales de ${nameB} son ${fmtNum(mB.totalAmount)}, vs ${fmtNum(mA.totalAmount)} de ${nameA}.`,
        evidence: `${nameA}: ${fmtNum(mA.totalAmount)} | ${nameB}: ${fmtNum(mB.totalAmount)} | Diferencia: ${isUp ? '+' : ''}${fmtNum(mB.totalAmount - mA.totalAmount)} (${isUp ? '+' : ''}${diffPct.toFixed(1)}%)`,
        problem: !isUp && absDiff > 15 ? `La caída de ${absDiff.toFixed(1)}% en ventas totales entre ambos períodos es significativa.` : null,
        suggestion: isUp
          ? `Identificar qué factores explican el incremento en ${nameB} para consolidar los resultados.`
          : `Revisar los productos y categorías con mayor caída entre ${nameA} y ${nameB}.`,
        isHypothesis: false,
      });
    }
  }

  // 2. Comparación de volumen (unidades)
  if (mA && mB && (mA.totalUnits > 0 || mB.totalUnits > 0)) {
    const diffPct = mA.totalUnits > 0
      ? ((mB.totalUnits - mA.totalUnits) / mA.totalUnits) * 100
      : 100;
    const isUp = diffPct > 0;
    const absDiff = Math.abs(diffPct);

    if (absDiff >= 3) {
      const priority: InsightPriority = absDiff > 25 ? 'important' : 'informative';
      insights.push({
        id: id(),
        type: 'comparison',
        priority,
        title: isUp
          ? `Volumen de unidades creció ${absDiff.toFixed(1)}% en ${nameB}`
          : `Volumen de unidades cayó ${absDiff.toFixed(1)}% en ${nameB}`,
        fact: `Las unidades vendidas pasaron de ${mA.totalUnits.toLocaleString()} (${nameA}) a ${mB.totalUnits.toLocaleString()} (${nameB}).`,
        evidence: `${nameA}: ${mA.totalUnits.toLocaleString()} uds | ${nameB}: ${mB.totalUnits.toLocaleString()} uds | Diferencia: ${isUp ? '+' : ''}${(mB.totalUnits - mA.totalUnits).toLocaleString()}`,
        problem: !isUp && absDiff > 20 ? `La caída en volumen puede indicar menor demanda o problemas de disponibilidad.` : null,
        suggestion: isUp
          ? 'Verificar si el crecimiento en volumen se refleja también en ventas o si hubo reducción de precio.'
          : 'Revisar los productos con mayor caída de volumen para evaluar reposición y demanda.',
        isHypothesis: true,
      });
    }
  }

  // 3. Mayor ganador entre datasets
  if (ctx.topGainers.length > 0) {
    const top = ctx.topGainers[0];
    const priority: InsightPriority = top.diffPct > 50 ? 'opportunity' : 'informative';
    insights.push({
      id: id(),
      type: 'comparison',
      priority,
      title: `${top.name} es el mayor ganador entre ${nameA} y ${nameB} (+${top.diffPct.toFixed(1)}%)`,
      fact: `${top.name} pasó de ${fmtNum(top.totalA)} en ${nameA} a ${fmtNum(top.totalB)} en ${nameB}.`,
      evidence: `${nameA}: ${fmtNum(top.totalA)} (${top.shareA.toFixed(1)}%) | ${nameB}: ${fmtNum(top.totalB)} (${top.shareB.toFixed(1)}%) | Crecimiento: +${fmtNum(top.diffAbs)} (+${top.diffPct.toFixed(1)}%)`,
      problem: null,
      suggestion: `Analizar qué condiciones favorecieron el crecimiento de ${top.name} para aplicarlas a otros productos.`,
      isHypothesis: true,
    });
  }

  // 4. Mayor perdedor entre datasets
  if (ctx.topLosers.length > 0) {
    const top = ctx.topLosers[0];
    const absDiff = Math.abs(top.diffPct);
    const priority: InsightPriority = absDiff > 30 ? 'important' : 'informative';
    insights.push({
      id: id(),
      type: 'comparison',
      priority,
      title: `${top.name} registra la mayor caída entre ${nameA} y ${nameB} (${top.diffPct.toFixed(1)}%)`,
      fact: `${top.name} pasó de ${fmtNum(top.totalA)} en ${nameA} a ${fmtNum(top.totalB)} en ${nameB}.`,
      evidence: `${nameA}: ${fmtNum(top.totalA)} (${top.shareA.toFixed(1)}%) | ${nameB}: ${fmtNum(top.totalB)} (${top.shareB.toFixed(1)}%) | Caída: ${fmtNum(top.diffAbs)} (${top.diffPct.toFixed(1)}%)`,
      problem: `La caída de ${absDiff.toFixed(1)}% en ${top.name} puede indicar menor demanda, problemas de stock o mayor competencia.`,
      suggestion: `Revisar precio, disponibilidad y posicionamiento de ${top.name} entre ambos períodos.`,
      isHypothesis: true,
    });
  }

  // 5. Productos nuevos en B que no estaban en A
  if (ctx.onlyInB.length > 0) {
    const names = ctx.onlyInB.slice(0, 3).map((c) => c.name).join(', ');
    insights.push({
      id: id(),
      type: 'comparison',
      priority: 'informative',
      title: `${ctx.onlyInB.length} producto(s) aparecen en ${nameB} pero no en ${nameA}`,
      fact: `Estos productos no tienen registros en ${nameA}: ${names}${ctx.onlyInB.length > 3 ? ' y otros.' : '.'}`,
      evidence: `Productos exclusivos de ${nameB}: ${ctx.onlyInB.length} | Ventas combinadas: ${fmtNum(ctx.onlyInB.reduce((a, c) => a + c.totalB, 0))}`,
      problem: null,
      suggestion: `Verificar si son productos nuevos incorporados entre períodos o si se deben a diferencias en los datos.`,
      isHypothesis: true,
    });
  }

  // 6. Productos que desaparecieron en B
  if (ctx.onlyInA.length > 0) {
    const names = ctx.onlyInA.slice(0, 3).map((c) => c.name).join(', ');
    insights.push({
      id: id(),
      type: 'comparison',
      priority: 'important',
      title: `${ctx.onlyInA.length} producto(s) de ${nameA} no aparecen en ${nameB}`,
      fact: `Estos productos tienen registros en ${nameA} pero no en ${nameB}: ${names}${ctx.onlyInA.length > 3 ? ' y otros.' : '.'}`,
      evidence: `Productos exclusivos de ${nameA}: ${ctx.onlyInA.length} | Ventas combinadas en ${nameA}: ${fmtNum(ctx.onlyInA.reduce((a, c) => a + c.totalA, 0))}`,
      problem: `Productos que estaban en ${nameA} no tienen registros en ${nameB}. Puede indicar descontinuación, falta de stock o cambio de nombre.`,
      suggestion: `Verificar si estos productos fueron descontinuados o si el dataset ${nameB} tiene una nomenclatura diferente.`,
      isHypothesis: true,
    });
  }

  // 7. Cambio en el producto líder
  if (mA?.topProduct && mB?.topProduct && mA.topProduct !== mB.topProduct) {
    insights.push({
      id: id(),
      type: 'comparison',
      priority: 'informative',
      title: `El producto líder cambió de ${mA.topProduct} a ${mB.topProduct}`,
      fact: `En ${nameA} el líder era ${mA.topProduct}. En ${nameB} el líder es ${mB.topProduct}.`,
      evidence: `Líder en ${nameA}: ${mA.topProduct} | Líder en ${nameB}: ${mB.topProduct}`,
      problem: null,
      suggestion: `Analizar si el cambio de liderazgo responde a condiciones de demanda, precio o disponibilidad.`,
      isHypothesis: true,
    });
  }

  // Ordenar por prioridad
  const order: Record<InsightPriority, number> = {
    critical: 0, important: 1, opportunity: 2, informative: 3,
  };
  return insights.sort((a, b) => order[a.priority] - order[b.priority]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNumericDiff(
  label: string,
  valueA: number,
  valueB: number,
  currency = '',
): KPIDiff {
  const diffPct = valueA > 0 ? ((valueB - valueA) / valueA) * 100 : valueB > 0 ? 100 : 0;
  const direction: KPIDiff['direction'] = diffPct > 0.5 ? 'up' : diffPct < -0.5 ? 'down' : 'flat';
  const fmt = (v: number) => currency ? `${currency} ${fmtNum(v)}` : fmtNum(v);
  return { label, valueA: fmt(valueA), valueB: fmt(valueB), diffPct, direction };
}

function shortName(name: string): string {
  return name.replace(/\.csv$/i, '').slice(0, 25);
}

// Re-export parseNumeric para uso interno si hace falta
export { parseNumeric };
