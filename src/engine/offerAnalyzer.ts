/**
 * offerAnalyzer.ts
 *
 * Analiza datos de ofertas/promociones a partir de un dataset.
 * Detecta automáticamente columnas de descuento y oferta.
 * Si no hay datos suficientes, devuelve warnings en lugar de inventar.
 */

import type { OfferAnalysis, CategoryBreakdown, Insight } from '../types';
import { parseNumeric, isMissing } from './metricsCalculator';
import { groupByCategory } from './metricsCalculator';
import { fmtNum } from './insightEngine';

const OFFER_COLUMN_NAMES = [
  'oferta', 'offer', 'promocion', 'promo', 'descuento', 'discount',
  'en_oferta', 'is_offer', 'tiene_oferta', 'has_offer', 'con_descuento',
  'tipo_oferta', 'offer_type', 'flag_oferta', 'oferta_activa',
];

const DISCOUNT_COLUMN_NAMES = [
  'descuento', 'discount', 'pct_descuento', 'discount_pct', 'porcentaje_descuento',
  'tasa_descuento', 'rebaja', 'ahorro', 'savings',
];

const OFFER_TRUE_VALUES = new Set([
  'si', 'sí', 'yes', '1', 'true', 'activo', 'activa', 'oferta', 'con oferta',
  'promocion', 'promo', 'y',
]);

// ─── Función principal ────────────────────────────────────────────────────────

export function analyzeOffers(
  rows: Record<string, string>[],
  columns: string[],
  monetaryCol: string | null,
  productCol: string | null,
  categoryCol: string | null,
): OfferAnalysis {
  const warnings: string[] = [];

  if (rows.length === 0) {
    return emptyAnalysis(['El dataset no contiene registros.']);
  }

  // Detectar columnas de oferta y descuento
  const offerCol = detectOfferColumn(columns, rows);
  const discountCol = detectDiscountColumn(columns, rows);

  if (!offerCol && !discountCol) {
    warnings.push('No se encontró una columna de oferta o descuento en el dataset.');
    warnings.push('Para analizar ofertas, el CSV debe tener una columna como: "oferta", "descuento", "promo", "en_oferta", etc.');
    return {
      hasOfferData: false,
      offerColumn: null,
      discountColumn: null,
      withOffer: { count: 0, total: 0, avgDiscount: 0 },
      withoutOffer: { count: 0, total: 0 },
      topPromotedProducts: [],
      lowPerformingOffers: [],
      discountVsQuantity: [],
      insights: [],
      warnings,
    };
  }

  if (!monetaryCol) {
    warnings.push('No se identificó una columna de monto/ventas. Los KPIs monetarios no estarán disponibles.');
  }

  // Separar filas con y sin oferta
  const withOffer: Record<string, string>[] = [];
  const withoutOffer: Record<string, string>[] = [];

  if (offerCol) {
    for (const row of rows) {
      const val = String(row[offerCol] ?? '').trim().toLowerCase();
      if (isMissing(val)) {
        withoutOffer.push(row);
        continue;
      }
      if (OFFER_TRUE_VALUES.has(val)) {
        withOffer.push(row);
      } else {
        withoutOffer.push(row);
      }
    }
  } else {
    // Si solo hay descuento, considerar como oferta cuando descuento > 0
    for (const row of rows) {
      const disc = discountCol ? parseNumeric(row[discountCol]) : null;
      if (disc !== null && disc > 0) {
        withOffer.push(row);
      } else {
        withoutOffer.push(row);
      }
    }
  }

  if (withOffer.length === 0) {
    warnings.push('No se encontraron registros con oferta activa en el dataset.');
  }

  // KPIs de oferta
  const offerTotal = monetaryCol
    ? withOffer.reduce((acc, r) => acc + (parseNumeric(r[monetaryCol]) ?? 0), 0)
    : 0;
  const noOfferTotal = monetaryCol
    ? withoutOffer.reduce((acc, r) => acc + (parseNumeric(r[monetaryCol]) ?? 0), 0)
    : 0;

  // Descuento promedio
  let avgDiscount = 0;
  if (discountCol && withOffer.length > 0) {
    const discounts = withOffer
      .map((r) => parseNumeric(r[discountCol]))
      .filter((v): v is number => v !== null && v >= 0);
    avgDiscount = discounts.length > 0
      ? discounts.reduce((a, b) => a + b, 0) / discounts.length
      : 0;
  }

  // Top productos en oferta
  const topPromotedProducts: CategoryBreakdown[] = productCol && monetaryCol
    ? groupByCategory(withOffer, productCol, monetaryCol, null).slice(0, 10)
    : categoryCol && monetaryCol
    ? groupByCategory(withOffer, categoryCol, monetaryCol, null).slice(0, 10)
    : [];

  // Productos con oferta pero bajo rendimiento (últimos del ranking)
  const lowPerformingOffers: CategoryBreakdown[] = topPromotedProducts.length > 3
    ? [...topPromotedProducts].reverse().slice(0, 3)
    : [];

  // Scatter: descuento vs cantidad (si aplica)
  const quantityColDetected = columns.find((c) =>
    ['cantidad', 'qty', 'quantity', 'unidades', 'units', 'cant'].includes(c.toLowerCase())
  ) ?? null;

  const discountVsQuantity = discountCol && quantityColDetected
    ? withOffer
        .slice(0, 100)
        .map((r) => ({
          discount: parseNumeric(r[discountCol]) ?? 0,
          quantity: parseNumeric(r[quantityColDetected]) ?? 0,
          product: productCol ? String(r[productCol] ?? '').slice(0, 20) : '',
        }))
        .filter((d) => d.discount > 0 && d.quantity > 0)
    : [];

  // Insights
  const insights = buildOfferInsights({
    withOfferCount: withOffer.length,
    withoutOfferCount: withoutOffer.length,
    offerTotal,
    noOfferTotal,
    avgDiscount,
    topPromotedProducts,
    lowPerformingOffers,
    totalRows: rows.length,
  });

  return {
    hasOfferData: true,
    offerColumn: offerCol,
    discountColumn: discountCol,
    withOffer: { count: withOffer.length, total: offerTotal, avgDiscount },
    withoutOffer: { count: withoutOffer.length, total: noOfferTotal },
    topPromotedProducts,
    lowPerformingOffers,
    discountVsQuantity,
    insights,
    warnings,
  };
}

// ─── Generadores de insights de oferta ────────────────────────────────────────

function buildOfferInsights(data: {
  withOfferCount: number;
  withoutOfferCount: number;
  offerTotal: number;
  noOfferTotal: number;
  avgDiscount: number;
  topPromotedProducts: CategoryBreakdown[];
  lowPerformingOffers: CategoryBreakdown[];
  totalRows: number;
}): Insight[] {
  const insights: Insight[] = [];
  const totalRows = data.totalRows;

  if (totalRows === 0) return insights;

  // Porcentaje con oferta
  const offerPct = (data.withOfferCount / totalRows) * 100;
  insights.push({
    id: `offer_${Date.now()}_1`,
    type: 'offer',
    priority: 'informative',
    title: `${offerPct.toFixed(1)}% de transacciones son con oferta`,
    fact: `${data.withOfferCount.toLocaleString()} de ${totalRows.toLocaleString()} transacciones tienen oferta activa.`,
    evidence: `Con oferta: ${data.withOfferCount} | Sin oferta: ${data.withoutOfferCount}`,
    problem: null,
    suggestion: 'Monitorear este porcentaje para evaluar el alcance de las promociones.',
    isHypothesis: false,
  });

  // Comparación de ingresos con/sin oferta
  if (data.offerTotal > 0 || data.noOfferTotal > 0) {
    const offerAvg = data.withOfferCount > 0 ? data.offerTotal / data.withOfferCount : 0;
    const noOfferAvg = data.withoutOfferCount > 0 ? data.noOfferTotal / data.withoutOfferCount : 0;
    const ticketDiff = offerAvg - noOfferAvg;
    const isOfferHigher = ticketDiff > 0;

    insights.push({
      id: `offer_${Date.now()}_2`,
      type: 'offer',
      priority: isOfferHigher ? 'opportunity' : 'important',
      title: isOfferHigher
        ? 'Transacciones con oferta tienen mayor ticket promedio'
        : 'Transacciones sin oferta tienen mayor ticket promedio',
      fact: `El ticket promedio con oferta es ${fmtNum(offerAvg)} y sin oferta es ${fmtNum(noOfferAvg)}.`,
      evidence: `Total con oferta: ${fmtNum(data.offerTotal)} (${data.withOfferCount} transacciones) | Total sin oferta: ${fmtNum(data.noOfferTotal)} (${data.withoutOfferCount} transacciones)`,
      problem: !isOfferHigher && Math.abs(ticketDiff) > 1
        ? 'Las ofertas podrían estar aplicándose en transacciones de menor valor.'
        : null,
      suggestion: isOfferHigher
        ? 'Las ofertas parecen estar atrayendo compras de mayor valor. Evaluar si es por mayor volumen o precio.'
        : 'Revisar si las ofertas están orientadas a productos de bajo valor o si están reduciendo el ticket promedio.',
      isHypothesis: true,
    });
  }

  // Descuento promedio
  if (data.avgDiscount > 0) {
    const highDiscount = data.avgDiscount > 30;
    insights.push({
      id: `offer_${Date.now()}_3`,
      type: 'offer',
      priority: highDiscount ? 'important' : 'informative',
      title: `Descuento promedio: ${data.avgDiscount.toFixed(1)}%`,
      fact: `El descuento promedio aplicado en ofertas es de ${data.avgDiscount.toFixed(1)}%.`,
      evidence: `Calculado sobre ${data.withOfferCount} transacciones con oferta activa.`,
      problem: highDiscount ? 'Un descuento promedio superior al 30% puede impactar los márgenes.' : null,
      suggestion: highDiscount
        ? 'Evaluar si el volumen adicional generado por las ofertas compensa el margen cedido.'
        : 'Monitorear el descuento promedio para mantenerlo en un rango sostenible.',
      isHypothesis: true,
    });
  }

  // Productos con bajo rendimiento en oferta
  if (data.lowPerformingOffers.length > 0) {
    const worst = data.lowPerformingOffers[0];
    insights.push({
      id: `offer_${Date.now()}_4`,
      type: 'offer',
      priority: 'important',
      title: `${worst.name} tiene bajo rendimiento en oferta`,
      fact: `${worst.name} genera solo ${fmtNum(worst.total)} a pesar de estar en oferta.`,
      evidence: `Participación en ventas con oferta: ${worst.share.toFixed(1)}%`,
      problem: 'Productos con descuento pero bajo volumen sugieren que la promoción no está siendo efectiva.',
      suggestion: 'Revisar la visibilidad, precio base y comunicación de la oferta en estos productos.',
      isHypothesis: true,
    });
  }

  return insights;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectOfferColumn(
  columns: string[],
  rows: Record<string, string>[],
): string | null {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_.-]+/g, '_');

  // Por nombre
  for (const col of columns) {
    if (OFFER_COLUMN_NAMES.includes(norm(col))) return col;
  }

  // Por contenido: columna con valores "si/no/yes/no/1/0"
  const boolValues = new Set(['si', 'sí', 'no', 'yes', '1', '0', 'true', 'false']);
  for (const col of columns) {
    const sample = rows.slice(0, 20).map((r) => String(r[col] ?? '').toLowerCase().trim()).filter(Boolean);
    if (sample.length === 0) continue;
    const isBool = sample.every((v) => boolValues.has(v));
    if (isBool) return col;
  }

  return null;
}

function detectDiscountColumn(
  columns: string[],
  rows: Record<string, string>[],
): string | null {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_.-]+/g, '_');

  for (const col of columns) {
    if (DISCOUNT_COLUMN_NAMES.includes(norm(col))) return col;
  }

  // Por contenido: columna numérica con valores entre 0 y 100 (porcentaje)
  for (const col of columns) {
    const sample = rows
      .slice(0, 20)
      .map((r) => parseNumeric(r[col]))
      .filter((v): v is number => v !== null);
    if (sample.length < 5) continue;
    const allInRange = sample.every((v) => v >= 0 && v <= 100);
    const hasNonZero = sample.some((v) => v > 0);
    if (allInRange && hasNonZero) return col;
  }

  return null;
}

function emptyAnalysis(warnings: string[]): OfferAnalysis {
  return {
    hasOfferData: false,
    offerColumn: null,
    discountColumn: null,
    withOffer: { count: 0, total: 0, avgDiscount: 0 },
    withoutOffer: { count: 0, total: 0 },
    topPromotedProducts: [],
    lowPerformingOffers: [],
    discountVsQuantity: [],
    insights: [],
    warnings,
  };
}
