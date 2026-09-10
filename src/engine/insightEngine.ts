/**
 * insightEngine.ts
 *
 * Genera insights automáticos a partir del dataset analizado.
 *
 * PRINCIPIOS:
 * - Un insight responde "¿qué significa esto?" — no es un KPI.
 * - Cada insight tiene hecho, evidencia, problema (opcional) y sugerencia derivada.
 * - No se infieren causas sin evidencia directa en los datos.
 * - Las hipótesis se marcan explícitamente.
 * - Sin fecha → sin tendencias. Los insights de distribución, concentración,
 *   ranking y anomalías siguen funcionando.
 * - No se duplica información: si un producto ya aparece como líder en
 *   concentración, no se repite en otro insight.
 */

import type {
  Insight, InsightPriority,
  PeriodComparison, CategoryBreakdown,
  Anomaly, SalesMetrics, TrendPoint,
} from '../types';
import { detectConcentration } from './anomalyDetector';
import { detectOverallTrend } from './trendDetector';
import { parseNumeric, isMissing } from './metricsCalculator';

let insightIdCounter = 0;
function nextId(): string {
  return `ins_${++insightIdCounter}_${Date.now()}`;
}

export function nextInsightId(): string {
  return nextId();
}

// ─── Helper de formateo ───────────────────────────────────────────────────────

export function fmtNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return n.toLocaleString('es-PE', { maximumFractionDigits: 2 });
  return n.toLocaleString('es-PE', { maximumFractionDigits: 2 });
}

// ─── 1. Tendencia temporal (solo si existe serie con ≥3 puntos) ───────────────

export function buildTrendInsight(
  series: TrendPoint[],
  _comparison: PeriodComparison | null,
): Insight | null {
  if (series.length < 3) return null;

  const { direction, strength } = detectOverallTrend(series);
  if (direction === 'flat' && strength === 'weak') return null;

  const last = series[series.length - 1];
  const first = series[0];
  const totalChangePct = first.value !== 0
    ? ((last.value - first.value) / first.value) * 100
    : 0;

  const isUp = direction === 'up';
  const strengthLabel = strength === 'strong' ? 'marcada' : strength === 'moderate' ? 'moderada' : 'leve';

  const priority: InsightPriority = strength === 'strong'
    ? (isUp ? 'important' : 'critical')
    : (isUp ? 'opportunity' : 'important');

  return {
    id: nextId(),
    type: 'trend',
    priority,
    title: isUp
      ? `Tendencia de crecimiento ${strengthLabel} en el período`
      : `Tendencia de caída ${strengthLabel} en el período`,
    fact: `Las ventas pasaron de ${fmtNum(first.value)} (${first.label}) a ${fmtNum(last.value)} (${last.label}), una variación de ${totalChangePct > 0 ? '+' : ''}${totalChangePct.toFixed(1)}%.`,
    evidence: `Serie de ${series.length} períodos | Inicio: ${fmtNum(first.value)} | Fin: ${fmtNum(last.value)} | Cambio neto: ${fmtNum(last.value - first.value)}`,
    problem: !isUp ? `La tendencia descendente de ${Math.abs(totalChangePct).toFixed(1)}% sugiere deterioro sostenido en las ventas.` : null,
    suggestion: isUp
      ? 'Identificar los períodos y productos que sostienen el crecimiento para mantener las condiciones favorables.'
      : 'Revisar los períodos de mayor caída y los productos responsables para tomar acciones correctivas.',
    isHypothesis: false,
  };
}

// ─── 2. Comparación del último período vs anterior ────────────────────────────

export function buildPeriodComparisonInsight(comp: PeriodComparison): Insight | null {
  if (Math.abs(comp.changePct) < 1) return null; // cambio irrelevante

  const isUp = comp.direction === 'up';
  const pct = Math.abs(comp.changePct).toFixed(1);

  const priority: InsightPriority =
    Math.abs(comp.changePct) > 30 ? (isUp ? 'important' : 'critical') :
    Math.abs(comp.changePct) > 10 ? (isUp ? 'opportunity' : 'important') :
    'informative';

  return {
    id: nextId(),
    type: 'comparison',
    priority,
    title: isUp
      ? `Ventas subieron ${pct}% en ${comp.periodB} vs ${comp.periodA}`
      : `Ventas bajaron ${pct}% en ${comp.periodB} vs ${comp.periodA}`,
    fact: `En ${comp.periodB} las ventas fueron ${fmtNum(comp.totalB)}, ${isUp ? 'superiores' : 'inferiores'} a ${comp.periodA} (${fmtNum(comp.totalA)}).`,
    evidence: `${comp.periodA}: ${fmtNum(comp.totalA)} | ${comp.periodB}: ${fmtNum(comp.totalB)} | Diferencia: ${isUp ? '+' : ''}${fmtNum(comp.change)} (${isUp ? '+' : ''}${pct}%)`,
    problem: !isUp && Math.abs(comp.changePct) > 10
      ? `La caída de ${pct}% respecto al período anterior es significativa.`
      : null,
    suggestion: isUp
      ? 'Analizar qué productos o categorías explican el incremento para replicar las condiciones.'
      : 'Revisar los productos con mayor caída en ese período para evaluar disponibilidad, precios y promociones.',
    isHypothesis: false,
  };
}

// ─── 3. Concentración en pocos productos/categorías ──────────────────────────

export function buildConcentrationInsight(
  categories: CategoryBreakdown[],
  entityName = 'productos',
  topN = 5,
): Insight | null {
  if (categories.length < 3) return null;

  const { sharePercent, topNames } = detectConcentration(
    categories.map((c) => ({ name: c.name, total: c.total })),
    topN,
  );

  if (sharePercent < 50) return null;

  const isHigh = sharePercent >= 70;
  const priority: InsightPriority = isHigh ? 'important' : 'informative';
  const actualTop = topNames.slice(0, Math.min(topN, topNames.length));
  const topTotal = categories
    .slice(0, actualTop.length)
    .reduce((acc, c) => acc + c.total, 0);
  const grandTotal = categories.reduce((acc, c) => acc + c.total, 0);

  return {
    id: nextId(),
    type: 'concentration',
    priority,
    title: `Los ${actualTop.length} principales ${entityName} concentran el ${sharePercent.toFixed(1)}% de ventas`,
    fact: `${actualTop.slice(0, 3).join(', ')}${actualTop.length > 3 ? ` y ${actualTop.length - 3} más` : ''} representan ${sharePercent.toFixed(1)}% del total de ventas.`,
    evidence: `Top ${actualTop.length}: ${fmtNum(topTotal)} de ${fmtNum(grandTotal)} totales (${sharePercent.toFixed(1)}%)`,
    problem: isHigh
      ? `Alta dependencia de pocos ${entityName}. Una caída en ellos impactaría directamente el resultado total.`
      : null,
    suggestion: isHigh
      ? `Evaluar estrategias para incrementar la participación de ${entityName} secundarios y reducir la concentración.`
      : `Monitorear los ${entityName} con menor participación para detectar oportunidades de crecimiento.`,
    isHypothesis: false,
  };
}

// ─── 4. Producto/categoría dominante (consolidado, sin repetir en otros) ──────

export function buildDominantInsight(
  categories: CategoryBreakdown[],
  entityName = 'producto',
  quantityBased = false,
): Insight | null {
  if (categories.length < 2) return null;

  const top = categories[0];
  const grandTotal = categories.reduce((acc, c) => acc + c.total, 0);
  const totalUnits = categories.reduce((acc, c) => acc + c.units, 0);

  if (top.total === 0 && top.units === 0) return null;

  // Solo mostrar si tiene participación significativa
  const share = grandTotal > 0 ? (top.total / grandTotal) * 100 : 0;
  const unitShare = totalUnits > 0 ? (top.units / totalUnits) * 100 : 0;
  if (share < 5 && unitShare < 5) return null;

  const priority: InsightPriority = share >= 30 ? 'important' : 'informative';

  // Construir evidencia con ventas y unidades si ambas están disponibles
  let evidenceParts = [`Ventas: ${fmtNum(top.total)} (${share.toFixed(1)}% del total)`];
  if (top.units > 0 && totalUnits > 0) {
    evidenceParts.push(`Unidades: ${top.units.toLocaleString()} (${unitShare.toFixed(1)}% del volumen)`);
  }
  evidenceParts.push(`Registros: ${top.count.toLocaleString()}`);

  const factParts: string[] = [];
  if (grandTotal > 0) factParts.push(`representa el ${share.toFixed(1)}% de los ingresos`);
  if (top.units > 0 && totalUnits > 0 && !quantityBased) factParts.push(`${unitShare.toFixed(1)}% del volumen`);

  return {
    id: nextId(),
    type: 'concentration',
    priority,
    title: `${top.name} lidera en ${entityName}s`,
    fact: `${top.name} ${factParts.join(' y ')}.`,
    evidence: evidenceParts.join(' | '),
    problem: share >= 40
      ? `La dependencia en un solo ${entityName} representa un riesgo si su disponibilidad o demanda varía.`
      : null,
    suggestion: share >= 40
      ? `Asegurar el stock continuo de ${top.name} y evaluar ${entityName}s con crecimiento potencial.`
      : `Monitorear el desempeño de ${top.name} y los ${entityName}s que le siguen en participación.`,
    isHypothesis: false,
  };
}

// ─── 5. Productos/categorías por encima y por debajo del promedio ─────────────

export function buildAboveBelowAverageInsight(
  categories: CategoryBreakdown[],
  entityName = 'productos',
): Insight | null {
  if (categories.length < 4) return null;

  const totals = categories.map((c) => c.total).filter((t) => t > 0);
  if (totals.length < 3) return null;

  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  const above = categories.filter((c) => c.total > avg);
  const below = categories.filter((c) => c.total > 0 && c.total < avg);

  if (above.length === 0 || below.length === 0) return null;

  // No es insight si la distribución es muy pareja
  const topAbove = above[0];
  const topBelow = below[below.length - 1];
  const ratio = topAbove.total / (topBelow.total || 1);
  if (ratio < 2) return null;

  return {
    id: nextId(),
    type: 'comparison',
    priority: 'informative',
    title: `${above.length} de ${categories.length} ${entityName} superan el promedio de ventas`,
    fact: `El promedio de ventas por ${entityName.slice(0, -1)} es ${fmtNum(avg)}. Solo ${above.length} de ${categories.length} lo superan.`,
    evidence: `Mayor: ${topAbove.name} (${fmtNum(topAbove.total)}) | Menor activo: ${topBelow.name} (${fmtNum(topBelow.total)}) | Promedio: ${fmtNum(avg)}`,
    problem: below.length > above.length
      ? `La mayoría de ${entityName} (${below.length} de ${categories.length}) está por debajo del promedio de ventas.`
      : null,
    suggestion: `Revisar los ${entityName} por debajo del promedio para evaluar si requieren ajustes en precio, visibilidad o reposición.`,
    isHypothesis: true,
  };
}

// ─── 6. Outliers / valores atípicos en ventas por registro ───────────────────

export function buildAnomalyInsight(anomaly: Anomaly): Insight {
  const isSpike = anomaly.type === 'spike';
  const isDrop = anomaly.type === 'drop';
  const isOutlier = anomaly.type === 'outlier';

  const priority: InsightPriority =
    anomaly.severity === 'high' ? 'critical' :
    anomaly.severity === 'medium' ? 'important' : 'informative';

  const typeLabel = isSpike ? 'Pico inusual'
    : isDrop ? 'Caída inusual'
    : 'Valor atípico';

  const context = isOutlier
    ? `El registro "${anomaly.label}" tiene un valor de ${fmtNum(anomaly.value)}, fuera del rango esperado.`
    : `Se detectó un ${typeLabel.toLowerCase()} con valor ${fmtNum(anomaly.value)} en ${anomaly.label}.`;

  return {
    id: nextId(),
    type: 'anomaly',
    priority,
    title: `${typeLabel} detectado — ${anomaly.label}`,
    fact: context,
    evidence: `Valor observado: ${fmtNum(anomaly.value)} | Rango esperado: ${fmtNum(anomaly.expectedRange[0])} – ${fmtNum(anomaly.expectedRange[1])}`,
    problem: anomaly.severity !== 'low'
      ? `El comportamiento atípico puede indicar un evento extraordinario, error de ingreso o condición especial.`
      : null,
    suggestion: 'Verificar los registros asociados para confirmar si el dato es correcto o requiere corrección.',
    isHypothesis: true,
  };
}

// ─── 7. Calidad de datos ──────────────────────────────────────────────────────

export function buildDataQualityInsight(
  qualityPct: number,
  missingCount: number,
  totalRows: number,
): Insight | null {
  if (qualityPct >= 95) return null;

  const missingPct = totalRows > 0 ? (missingCount / totalRows) * 100 : 0;
  const priority: InsightPriority =
    qualityPct < 70 ? 'critical' : qualityPct < 85 ? 'important' : 'informative';

  return {
    id: nextId(),
    type: 'quality',
    priority,
    title: `Calidad de datos: ${qualityPct.toFixed(0)}% — se recomienda limpieza`,
    fact: `El ${missingPct.toFixed(1)}% de los registros tiene valores faltantes o inválidos en la columna de ventas (${missingCount.toLocaleString()} de ${totalRows.toLocaleString()}).`,
    evidence: `Total registros: ${totalRows.toLocaleString()} | Con problemas: ${missingCount.toLocaleString()} | Calidad: ${qualityPct.toFixed(0)}%`,
    problem: qualityPct < 85
      ? 'Los valores faltantes o inválidos pueden distorsionar los KPIs y los insights generados.'
      : null,
    suggestion: 'Usar el módulo de Limpieza para corregir valores faltantes, duplicados y formatos incorrectos antes de analizar.',
    isHypothesis: false,
  };
}

// ─── 8. Comparación grupos con/sin descuento (si existe columna de descuento) ─

export function buildDiscountGroupInsight(
  rows: Record<string, string>[],
  monetaryCol: string,
  discountCol: string,
  quantityCol: string | null,
): Insight | null {
  if (rows.length < 10) return null;

  const withDiscount: number[] = [];
  const withoutDiscount: number[] = [];
  const withDiscountUnits: number[] = [];
  const withoutDiscountUnits: number[] = [];

  for (const row of rows) {
    const amount = parseNumeric(row[monetaryCol]);
    const disc = parseNumeric(row[discountCol]);
    if (amount === null || amount < 0) continue;

    const hasDisc = disc !== null && disc > 0;
    if (hasDisc) {
      withDiscount.push(amount);
      if (quantityCol) {
        const qty = parseNumeric(row[quantityCol]);
        if (qty !== null && qty >= 0) withDiscountUnits.push(qty);
      }
    } else {
      withoutDiscount.push(amount);
      if (quantityCol) {
        const qty = parseNumeric(row[quantityCol]);
        if (qty !== null && qty >= 0) withoutDiscountUnits.push(qty);
      }
    }
  }

  if (withDiscount.length < 5 || withoutDiscount.length < 5) return null;

  const avgWith = withDiscount.reduce((a, b) => a + b, 0) / withDiscount.length;
  const avgWithout = withoutDiscount.reduce((a, b) => a + b, 0) / withoutDiscount.length;
  const diffPct = avgWithout !== 0 ? ((avgWith - avgWithout) / avgWithout) * 100 : 0;

  // Comparación de unidades si está disponible
  let unitEvidence = '';
  if (withDiscountUnits.length > 0 && withoutDiscountUnits.length > 0) {
    const avgUnitsWithDisc = withDiscountUnits.reduce((a, b) => a + b, 0) / withDiscountUnits.length;
    const avgUnitsWithout = withoutDiscountUnits.reduce((a, b) => a + b, 0) / withoutDiscountUnits.length;
    const unitDiffPct = avgUnitsWithout !== 0 ? ((avgUnitsWithDisc - avgUnitsWithout) / avgUnitsWithout) * 100 : 0;
    unitEvidence = ` | Unidades promedio con descuento: ${avgUnitsWithDisc.toFixed(1)} vs sin descuento: ${avgUnitsWithout.toFixed(1)} (${unitDiffPct > 0 ? '+' : ''}${unitDiffPct.toFixed(1)}%)`;
  }

  const isHigherWithDisc = diffPct > 0;
  const absDiff = Math.abs(diffPct);
  if (absDiff < 3) return null; // diferencia no significativa

  const priority: InsightPriority = absDiff > 20 ? 'important' : 'informative';

  return {
    id: nextId(),
    type: 'comparison',
    priority,
    title: isHigherWithDisc
      ? `Registros con descuento presentan ${absDiff.toFixed(1)}% más en valor promedio`
      : `Registros sin descuento presentan ${absDiff.toFixed(1)}% más en valor promedio`,
    fact: `El valor promedio por registro con descuento es ${fmtNum(avgWith)}, vs ${fmtNum(avgWithout)} sin descuento.`,
    evidence: `Con descuento: ${withDiscount.length} registros, promedio ${fmtNum(avgWith)} | Sin descuento: ${withoutDiscount.length} registros, promedio ${fmtNum(avgWithout)}${unitEvidence}`,
    problem: !isHigherWithDisc && absDiff > 15
      ? 'Los registros con descuento tienen menor valor promedio, lo que podría indicar que los descuentos se aplican a productos de menor precio.'
      : null,
    suggestion: isHigherWithDisc
      ? 'Los descuentos se asocian a registros de mayor valor. Evaluar si esto refleja compras en mayor volumen o productos de mayor precio.'
      : 'Revisar si los descuentos están orientados a productos de bajo valor o si están reduciendo el ticket efectivo.',
    isHypothesis: true,
  };
}

// ─── 9. Peor performer (sin duplicar el líder) ────────────────────────────────

export function buildWorstPerformerInsight(
  categories: CategoryBreakdown[],
  _entityName = 'categoría',
): Insight | null {
  if (categories.length < 3) return null;

  // Filtrar los que tienen ventas reales
  const active = categories.filter((c) => c.total > 0 && c.share >= 0.5);
  if (active.length < 2) return null;

  const worst = active[active.length - 1];
  const best = active[0];

  // No generar si el peor y el mejor son demasiado cercanos
  if (best.total === 0) return null;
  const ratio = best.total / worst.total;
  if (ratio < 3) return null;

  return {
    id: nextId(),
    type: 'comparison',
    priority: 'informative',
    title: `${worst.name} tiene la menor participación entre los activos`,
    fact: `${worst.name} representa el ${worst.share.toFixed(1)}% de las ventas (${fmtNum(worst.total)}), frente a ${best.name} con ${best.share.toFixed(1)}%.`,
    evidence: `Menor: ${worst.name} — ${fmtNum(worst.total)} (${worst.share.toFixed(1)}%) | Mayor: ${best.name} — ${fmtNum(best.total)} (${best.share.toFixed(1)}%) | Ratio: ${ratio.toFixed(1)}x`,
    problem: null,
    suggestion: `Evaluar si ${worst.name} tiene potencial de crecimiento o si debe revisarse su espacio en el catálogo.`,
    isHypothesis: true,
  };
}

// ─── 10. Valor promedio por registro (reemplaza "ticket promedio" mal usado) ──

export function buildAvgValueInsight(
  metrics: SalesMetrics,
  hasTicketCol: boolean,
): Insight | null {
  if (metrics.transactionCount < 10) return null;
  if (metrics.avgTicket <= 0) return null;

  // Solo llamarlo "ticket promedio" si hay columna identificadora de ticket
  const label = hasTicketCol ? 'Ticket promedio' : 'Valor promedio por registro';

  // Solo incluir si el valor es relevante para el análisis
  // No mostrar como insight si es simplemente total/count sin contexto
  if (!hasTicketCol && metrics.transactionCount < 50) return null;

  return {
    id: nextId(),
    type: 'comparison',
    priority: 'informative',
    title: `${label}: ${fmtNum(metrics.avgTicket)}`,
    fact: `El ${label.toLowerCase()} es de ${fmtNum(metrics.avgTicket)}, calculado sobre ${metrics.transactionCount.toLocaleString()} registros con valor válido.`,
    evidence: `Total ventas: ${fmtNum(metrics.totalAmount)} | Registros válidos: ${metrics.transactionCount.toLocaleString()} | Promedio: ${fmtNum(metrics.avgTicket)}`,
    problem: null,
    suggestion: hasTicketCol
      ? 'Monitorear el ticket promedio en el tiempo para detectar si el crecimiento viene de volumen, precio o ambos.'
      : 'Para un análisis de ticket real, asegúrate de que el dataset incluya una columna de identificador de venta/pedido.',
    isHypothesis: false,
  };
}

// ─── Ordenamiento y deduplicación ─────────────────────────────────────────────

const PRIORITY_ORDER: Record<InsightPriority, number> = {
  critical: 0,
  important: 1,
  opportunity: 2,
  informative: 3,
};

export function sortInsightsByPriority(insights: Insight[]): Insight[] {
  return [...insights].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );
}

/**
 * Elimina insights que mencionan la misma entidad en el mismo contexto.
 * Evita que "Paracetamol es líder" aparezca en concentración Y en dominante.
 */
export function deduplicateInsights(insights: Insight[]): Insight[] {
  const seen = new Set<string>();
  return insights.filter((ins) => {
    // Clave de deduplicación: tipo + primeras palabras del título
    const key = `${ins.type}_${ins.title.split(' ').slice(0, 4).join('_').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Helpers internos exportados para el motor ────────────────────────────────

/** Detecta si existe una columna de ticket/orden/pedido en el dataset. */
export function hasTicketIdentifier(
  _rows: Record<string, string>[],
  columns: string[],
): boolean {
  const ticketNames = [
    'ticket', 'ticket_id', 'sale_id', 'order_id', 'invoice_id',
    'factura', 'pedido', 'boleta', 'num_venta', 'venta_id', 'id_venta',
    'folio', 'nro_venta', 'nro_pedido', 'receipt_id',
  ];
  const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_.-]+/g, '_');
  return columns.some((c) => ticketNames.some((t) => norm(c) === t || norm(c).includes(t)));
}

/** Detecta columna de descuento por nombre (sin importar el contenido). */
export function findDiscountColumn(columns: string[]): string | null {
  const discountNames = [
    'descuento', 'discount', 'pct_descuento', 'discount_pct',
    'porcentaje_descuento', 'tasa_descuento', 'rebaja', 'ahorro',
  ];
  const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_.-]+/g, '_');
  return columns.find((c) => discountNames.some((d) => norm(c) === d || norm(c).includes(d))) ?? null;
}

/** Detecta si hay valores faltantes en una columna. */
export function countMissing(_rows: Record<string, string>[], col: string): number {
  return _rows.filter((r) => isMissing(r[col])).length;
}
