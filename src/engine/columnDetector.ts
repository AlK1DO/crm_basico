/**
 * columnDetector.ts
 *
 * Detecta automáticamente el tipo semántico de cada columna de un dataset.
 * No depende de nombres exactos — usa heurísticas de nombre + contenido.
 */

import type { ColumnInfo, ColumnType } from '../types';

// ─── Alias de nombres conocidos ───────────────────────────────────────────────

const MONETARY_NAMES = [
  'monto', 'importe', 'total', 'total_venta', 'total_ventas', 'venta', 'ventas',
  'precio', 'price', 'amount', 'revenue', 'ingreso', 'ingresos', 'valor',
  'subtotal', 'neto', 'bruto', 'factura', 'cobro', 'pago', 'sale', 'sales',
  'total_amount', 'sale_amount', 'net_amount',
];

const QUANTITY_NAMES = [
  'cantidad', 'qty', 'quantity', 'unidades', 'units', 'cant', 'piezas',
  'items', 'num', 'numero', 'count', 'stock', 'volumen', 'volume',
];

const TEMPORAL_NAMES = [
  'fecha', 'date', 'fecha_venta', 'fecha_compra', 'fecha_registro',
  'sale_date', 'order_date', 'created_at', 'updated_at', 'dia', 'day',
  'mes', 'month', 'periodo', 'period', 'timestamp', 'tiempo', 'time',
  'year', 'año',
];

const PRODUCT_NAMES = [
  'producto', 'product', 'medicamento', 'medicine', 'item', 'descripcion',
  'description', 'articulo', 'article', 'nombre', 'name', 'detalle',
  'detail', 'farmaco', 'drug', 'presentacion',
];

const CATEGORY_NAMES = [
  'categoria', 'category', 'tipo', 'type', 'grupo', 'group', 'clase',
  'class', 'linea', 'line', 'familia', 'family', 'departamento',
  'department', 'seccion', 'section', 'rubro',
];

const IDENTIFIER_NAMES = [
  'id', 'codigo', 'code', 'sku', 'ref', 'referencia', 'num_pedido',
  'order_id', 'invoice', 'factura_num', 'ticket', 'folio', 'nro',
];

// ─── Helpers de detección de contenido ────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[\s_.-]+/g, '_');
}

/** Porcentaje de valores parseables como número flotante (excluye vacíos). */
function numericRatio(sample: string[]): number {
  const nonEmpty = sample.filter((v) => v.trim() !== '');
  if (!nonEmpty.length) return 0;
  const numeric = nonEmpty.filter((v) => !isNaN(parseFloat(v.replace(',', '.'))));
  return numeric.length / nonEmpty.length;
}

/** Longitud promedio de dígitos (para diferenciar IDs de métricas). */
function avgDigitLength(sample: string[]): number {
  const valid = sample.filter((v) => v.trim() !== '');
  if (!valid.length) return 0;
  return valid.reduce((acc, v) => acc + v.replace(/\D/g, '').length, 0) / valid.length;
}

/** Detecta si la mayoría de valores no vacíos son fechas parseables. */
function looksLikeDate(sample: string[]): boolean {
  const nonEmpty = sample.filter((v) => v.trim() !== '');
  if (!nonEmpty.length) return false;

  // Patrones comunes de fecha
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/,         // ISO: 2024-01-15
    /^\d{2}\/\d{2}\/\d{4}/,       // DD/MM/YYYY
    /^\d{2}-\d{2}-\d{4}/,         // DD-MM-YYYY
    /^\d{4}\/\d{2}\/\d{2}/,       // YYYY/MM/DD
    /^\d{2}\/\d{2}\/\d{2}$/,      // DD/MM/YY
    /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/, // Jan 15, 2024
  ];

  const dateCount = nonEmpty.filter((v) =>
    datePatterns.some((re) => re.test(v.trim()))
  ).length;

  return dateCount / nonEmpty.length >= 0.7;
}

/** Detecta si los valores son categóricos (pocas categorías distintas vs total). */
function looksLikeCategorical(sample: string[], totalRows: number): boolean {
  const nonEmpty = sample.filter((v) => v.trim() !== '');
  if (!nonEmpty.length) return false;
  const unique = new Set(nonEmpty.map((v) => v.trim().toLowerCase())).size;
  // Categórica si hay pocas categorías únicas relativas al total
  return unique <= Math.max(20, totalRows * 0.05);
}

// ─── Función principal ────────────────────────────────────────────────────────

export function detectColumns(
  columns: string[],
  rows: Record<string, string>[],
  sampleSize = 30
): ColumnInfo[] {
  const sampleRows = rows.slice(0, sampleSize);

  return columns.map((col): ColumnInfo => {
    const norm = normalize(col);
    const sample = sampleRows
      .map((r) => String(r[col] ?? '').trim())
      .filter((v) => v !== '');

    // 1. Intentar detectar por nombre primero
    if (MONETARY_NAMES.some((n) => norm === n || norm.includes(n))) {
      return buildInfo(col, 'monetary', sample);
    }
    if (QUANTITY_NAMES.some((n) => norm === n || norm.includes(n))) {
      return buildInfo(col, 'quantity', sample);
    }
    if (TEMPORAL_NAMES.some((n) => norm === n || norm.includes(n))) {
      return buildInfo(col, 'temporal', sample);
    }
    if (PRODUCT_NAMES.some((n) => norm === n || norm.includes(n))) {
      return buildInfo(col, 'categorical', sample); // productos son categóricos
    }
    if (CATEGORY_NAMES.some((n) => norm === n || norm.includes(n))) {
      return buildInfo(col, 'categorical', sample);
    }
    if (IDENTIFIER_NAMES.some((n) => norm === n || norm === `${n}_id` || norm.startsWith(`${n}_`))) {
      return buildInfo(col, 'identifier', sample);
    }

    // 2. Detectar por contenido
    if (looksLikeDate(sample)) {
      return buildInfo(col, 'temporal', sample);
    }

    const numRatio = numericRatio(sample);
    const avgDigits = avgDigitLength(sample);

    if (numRatio >= 0.85) {
      // Números con muchos dígitos → probablemente IDs o códigos
      if (avgDigits > 7) {
        return buildInfo(col, 'identifier', sample);
      }
      // Números con decimales y valores medianos → monetario
      const hasDecimals = sample.some((v) => v.includes('.') || v.includes(','));
      const avgVal = sample.reduce((acc, v) => acc + (parseFloat(v.replace(',', '.')) || 0), 0) / sample.length;
      if (hasDecimals || avgVal > 10) {
        return buildInfo(col, 'monetary', sample);
      }
      return buildInfo(col, 'quantity', sample);
    }

    if (looksLikeCategorical(sample, rows.length)) {
      return buildInfo(col, 'categorical', sample);
    }

    return buildInfo(col, 'unknown', sample);
  });
}

function buildInfo(col: string, type: ColumnType, sample: string[]): ColumnInfo {
  return {
    name: col,
    type,
    friendlyName: toFriendlyName(col, type),
    sample: sample.slice(0, 5),
  };
}

function toFriendlyName(col: string, type: ColumnType): string {
  const nameMap: Record<string, string> = {
    total_amount: 'Total de ventas',
    total_venta: 'Total de ventas',
    total_ventas: 'Total de ventas',
    monto: 'Monto',
    importe: 'Importe',
    precio: 'Precio',
    price: 'Precio',
    cantidad: 'Cantidad',
    qty: 'Cantidad',
    quantity: 'Cantidad',
    unidades: 'Unidades',
    fecha: 'Fecha',
    date: 'Fecha',
    fecha_venta: 'Fecha de venta',
    producto: 'Producto',
    product: 'Producto',
    medicamento: 'Medicamento',
    categoria: 'Categoría',
    category: 'Categoría',
    tipo: 'Tipo',
  };

  const norm = normalize(col);
  if (nameMap[norm]) return nameMap[norm];

  // Capitalizar y reemplazar separadores
  const friendly = col
    .replace(/[_. -]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const typeHints: Record<ColumnType, string> = {
    monetary: `${friendly} (monto)`,
    quantity: `${friendly} (cantidad)`,
    temporal: `${friendly} (fecha)`,
    categorical: friendly,
    identifier: `${friendly} (código)`,
    unknown: friendly,
  };

  return typeHints[type] ?? friendly;
}

// ─── Helpers de búsqueda rápida ───────────────────────────────────────────────

/** Devuelve la primera columna que coincide con el tipo buscado. */
export function findColumnByType(
  columnInfo: ColumnInfo[],
  type: ColumnType
): string | null {
  return columnInfo.find((c) => c.type === type)?.name ?? null;
}

/** Devuelve todas las columnas de un tipo. */
export function findAllColumnsByType(
  columnInfo: ColumnInfo[],
  type: ColumnType
): string[] {
  return columnInfo.filter((c) => c.type === type).map((c) => c.name);
}
