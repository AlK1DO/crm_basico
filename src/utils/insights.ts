import type { Dataset } from '../hooks/useDatasets';

export type ColumnKind = 'numeric' | 'categorical' | 'date';

export interface ColumnMetric {
  key: string;
  label: string;
  value: string;
}

export interface NumericSummary {
  count: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  median: number;
}

export interface ColumnInsight {
  name: string;
  kind: ColumnKind;
  total: number;
  missing: number;
  uniqueCount: number;
  sampleValues: string[];
  numeric?: NumericSummary;
  categoryTop?: Array<{ label: string; count: number }>;
  dateRange?: { earliest: string; latest: string };
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface DatasetInsights {
  dataset: Dataset;
  rowCount: number;
  columnCount: number;
  numericColumns: string[];
  categoricalColumns: string[];
  dateColumns: string[];
  columns: ColumnInsight[];
  summaryCards: ColumnMetric[];
  trendData: TrendPoint[];
  categoryData: Array<{ name: string; value: number }>;
  alerts: string[];
  conclusions: string[];
}

export interface CompatibleColumnPair {
  left: string;
  right: string;
  type: ColumnKind;
  leftStats: NumericSummary | null;
  rightStats: NumericSummary | null;
  delta: number | null;
  percentDelta: number | null;
}

export interface ComparisonResult {
  compatiblePairs: CompatibleColumnPair[];
  unmatchedLeft: string[];
  unmatchedRight: string[];
  notes: string[];
}

const normalizeColumnName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeComparableValue = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

const isEmptyValue = (value: unknown): boolean =>
  value === null || value === undefined || String(value).trim() === '';

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/[$%]/g, '').replace(/,/g, '').replace(/\s+/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseDateValue = (value: unknown): Date | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const formats = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{4}\/\d{2}\/\d{2}$/,
    /^\d{2}-\d{2}-\d{4}$/,
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^\d{4}-\d{2}-\d{2}T.*$/,
    /^\d{2}-\d{2}-\d{2}$/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  ];

  if (!formats.some((pattern) => pattern.test(raw))) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const standardDeviation = (values: number[]): number => {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const detectColumnKind = (values: unknown[]): ColumnKind => {
  const nonEmpty = values.filter((value) => !isEmptyValue(value));
  if (!nonEmpty.length) return 'categorical';

  const numericValues = nonEmpty.map((value) => parseNumber(value)).filter((value): value is number => value !== null);
  const dateValues = nonEmpty.map((value) => parseDateValue(value)).filter((value): value is Date => value !== null);

  if (numericValues.length / nonEmpty.length >= 0.8) return 'numeric';
  if (dateValues.length / nonEmpty.length >= 0.7) return 'date';
  return 'categorical';
};

const buildNumericSummary = (values: number[]): NumericSummary => {
  const count = values.length;
  const sum = values.reduce((acc, value) => acc + value, 0);
  const mean = count ? sum / count : 0;
  const min = count ? Math.min(...values) : 0;
  const max = count ? Math.max(...values) : 0;

  return {
    count,
    sum,
    mean,
    min,
    max,
    stdDev: standardDeviation(values),
    median: median(values),
  };
};

const buildCategoryTop = (values: unknown[]) => {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const key = normalizeComparableValue(value);
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
};

export function detectColumnTypes(dataset: Dataset): ColumnInsight[] {
  return dataset.columns.map((columnName) => {
    const rawValues = dataset.rows.map((row) => row[columnName]);
    const cleanValues = rawValues.filter((value) => !isEmptyValue(value));
    const kind = detectColumnKind(rawValues);
    const uniqueValues = new Set(cleanValues.map((value) => normalizeComparableValue(value)).filter(Boolean));

    const basic: ColumnInsight = {
      name: columnName,
      kind,
      total: rawValues.length,
      missing: rawValues.length - cleanValues.length,
      uniqueCount: uniqueValues.size,
      sampleValues: cleanValues.slice(0, 8).map((value) => String(value).trim()).filter(Boolean),
    };

    if (kind === 'numeric') {
      const numericValues = cleanValues
        .map((value) => parseNumber(value))
        .filter((value): value is number => value !== null);

      if (numericValues.length) {
        basic.numeric = buildNumericSummary(numericValues);
      }
    }

    if (kind === 'categorical') {
      basic.categoryTop = buildCategoryTop(cleanValues);
    }

    if (kind === 'date') {
      const dates = cleanValues
        .map((value) => parseDateValue(value))
        .filter((value): value is Date => value !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      if (dates.length) {
        basic.dateRange = {
          earliest: dates[0].toISOString().slice(0, 10),
          latest: dates[dates.length - 1].toISOString().slice(0, 10),
        };
      }
    }

    return basic;
  });
}

export function analyzeDataset(dataset: Dataset): DatasetInsights {
  const columns = detectColumnTypes(dataset);
  const numericColumns = columns.filter((column) => column.kind === 'numeric').map((column) => column.name);
  const categoricalColumns = columns.filter((column) => column.kind === 'categorical').map((column) => column.name);
  const dateColumns = columns.filter((column) => column.kind === 'date').map((column) => column.name);

  const summaryCards: ColumnMetric[] = [
    { key: 'rows', label: 'Filas', value: dataset.rows.length.toLocaleString('es-MX') },
    { key: 'columns', label: 'Columnas', value: dataset.columns.length.toString() },
    { key: 'numeric', label: 'Numéricas', value: numericColumns.length.toString() },
    { key: 'categorical', label: 'Categóricas', value: categoricalColumns.length.toString() },
    { key: 'dates', label: 'Fechas', value: dateColumns.length.toString() },
  ];

  const trendData: TrendPoint[] = [];
  if (dateColumns.length && numericColumns.length) {
    const dateColumn = dateColumns[0];
    const valueColumn = numericColumns[0];
    const map = new Map<string, number>();

    dataset.rows.forEach((row) => {
      const dateValue = parseDateValue(row[dateColumn]);
      const numericValue = parseNumber(row[valueColumn]);
      if (!dateValue || numericValue === null) return;
      const key = dateValue.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + numericValue);
    });

    Array.from(map.entries())
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .forEach(([date, value]) => trendData.push({ date, value }));
  }

  const categoryData = (() => {
    const categoryColumn = columns.find((column) => column.kind === 'categorical');
    if (!categoryColumn) return [];

    const counts = new Map<string, number>();
    dataset.rows.forEach((row) => {
      const raw = row[categoryColumn.name];
      if (isEmptyValue(raw)) return;
      const key = String(raw).trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  })();

  const alerts: string[] = [];

  columns.forEach((column) => {
    if (column.missing > 0 && column.total > 0) {
      const percent = (column.missing / column.total) * 100;
      if (percent >= 20) {
        alerts.push(`La columna ${column.name} tiene ${column.missing} valores faltantes (${percent.toFixed(1)}%).`);
      }
    }

    if (column.kind === 'numeric' && column.numeric) {
      const values = dataset.rows
        .map((row) => parseNumber(row[column.name]))
        .filter((value): value is number => value !== null);
      if (values.length > 2) {
        const q1 = median(values.slice(0, Math.ceil(values.length / 2)));
        const q3 = median(values.slice(Math.floor(values.length / 2)));
        const iqr = Math.max(1, q3 - q1);
        const outliers = values.filter((value) => value < q1 - 1.5 * iqr || value > q3 + 1.5 * iqr);
        if (outliers.length) {
          alerts.push(`Se detectaron valores atípicos en ${column.name}: ${outliers.length} registros fuera del rango esperado.`);
        }
      }
    }
  });

  if (!alerts.length) {
    alerts.push('No se detectaron anomalías relevantes en las columnas analizadas.');
  }

  const conclusions: string[] = [];

  if (numericColumns.length) {
    const firstNumeric = columns.find((column) => column.kind === 'numeric');
    const firstNumericStats = firstNumeric?.numeric;
    if (firstNumericStats) {
      conclusions.push(`La variable ${firstNumeric?.name ?? 'principal'} tiene un promedio de ${firstNumericStats.mean.toFixed(2)}, con un rango entre ${firstNumericStats.min.toFixed(2)} y ${firstNumericStats.max.toFixed(2)}.`);
    }
  }

  if (categoryData.length) {
    const topCategory = categoryData[0];
    conclusions.push(`La categoría más frecuente es ${topCategory.name} con ${topCategory.value} registros.`);
  }

  if (dateColumns.length && trendData.length) {
    const first = trendData[0];
    const last = trendData[trendData.length - 1];
    const delta = last.value - first.value;
    conclusions.push(`La serie temporal muestra una variación de ${delta.toFixed(2)} unidades entre ${first.date} y ${last.date}.`);
  }

  if (!conclusions.length) {
    conclusions.push('El archivo está cargado y fue analizado, pero no se encontraron patrones estadísticos claros para resumir automáticamente.');
  }

  return {
    dataset,
    rowCount: dataset.rows.length,
    columnCount: dataset.columns.length,
    numericColumns,
    categoricalColumns,
    dateColumns,
    columns,
    summaryCards,
    trendData,
    categoryData,
    alerts,
    conclusions,
  };
}

export function findCompatibleColumns(left: Dataset, right: Dataset): ComparisonResult {
  const leftAnalysis = analyzeDataset(left);
  const rightAnalysis = analyzeDataset(right);

  const leftColumns = leftAnalysis.columns;
  const rightColumns = rightAnalysis.columns;

  const compatiblePairs: CompatibleColumnPair[] = [];
  const matchedRight = new Set<string>();
  const unmatchedLeft: string[] = [];
  const unmatchedRight: string[] = [];

  leftColumns.forEach((col) => {
    const normalizedLeft = normalizeColumnName(col.name);
    const match = rightColumns.find((candidate) => {
      if (matchedRight.has(candidate.name)) return false;
      const normalizedRight = normalizeColumnName(candidate.name);
      const sameName = normalizedLeft === normalizedRight;
      const tokensOverlap = normalizedLeft.split(' ').filter(Boolean).some((token) => normalizedRight.includes(token));
      const compatibleType = 
        (col.kind === 'numeric' && candidate.kind === 'numeric') ||
        (col.kind === 'date' && candidate.kind === 'date') ||
        (col.kind === 'categorical' && candidate.kind === 'categorical');

      return (sameName || tokensOverlap) && compatibleType;
    });

    if (!match) {
      unmatchedLeft.push(col.name);
      return;
    }

    matchedRight.add(match.name);

    const leftValues = left.rows
      .map((row) => parseNumber(row[col.name]))
      .filter((value): value is number => value !== null);
    const rightValues = right.rows
      .map((row) => parseNumber(row[match.name]))
      .filter((value): value is number => value !== null);

    const leftStats = leftValues.length ? buildNumericSummary(leftValues) : null;
    const rightStats = rightValues.length ? buildNumericSummary(rightValues) : null;

    const delta = leftStats && rightStats ? rightStats.mean - leftStats.mean : null;
    const percentDelta = leftStats && rightStats && leftStats.mean !== 0
      ? ((rightStats.mean - leftStats.mean) / leftStats.mean) * 100
      : null;

    compatiblePairs.push({
      left: col.name,
      right: match.name,
      type: col.kind,
      leftStats,
      rightStats,
      delta,
      percentDelta,
    });
  });

  rightColumns.forEach((col) => {
    if (!matchedRight.has(col.name)) {
      unmatchedRight.push(col.name);
    }
  });

  const notes = [
    ...compatiblePairs.map((pair) => `Se comparó ${pair.left} con ${pair.right} usando coincidencia automática.`),
    ...unmatchedLeft.map((name) => `La columna ${name} no pudo compararse: no existe una columna equivalente en el otro archivo.`),
    ...unmatchedRight.map((name) => `La columna ${name} no pudo compararse: no existe una columna equivalente en el archivo original.`),
  ];

  return { compatiblePairs, unmatchedLeft, unmatchedRight, notes };
}

export function buildComparisonNarrative(left: Dataset, right: Dataset): string[] {
  const comparison = findCompatibleColumns(left, right);
  const narrative: string[] = [];

  if (!comparison.compatiblePairs.length) {
    narrative.push('No se encontraron columnas comparables automáticamente entre ambos CSV.');
    return narrative.concat(comparison.notes);
  }

  const firstPair = comparison.compatiblePairs[0];
  if (firstPair.leftStats && firstPair.rightStats) {
    narrative.push(`La media de ${firstPair.left} en el CSV A es ${firstPair.leftStats.mean.toFixed(2)} y en el CSV B es ${firstPair.rightStats.mean.toFixed(2)}.`);
  }

  if (firstPair.delta !== null && firstPair.percentDelta !== null) {
    narrative.push(`La diferencia promedio entre ${firstPair.right} y ${firstPair.left} es ${firstPair.delta.toFixed(2)} unidades (${firstPair.percentDelta.toFixed(1)}%).`);
  }

  if (comparison.unmatchedLeft.length || comparison.unmatchedRight.length) {
    narrative.push('Se encontraron columnas sin equivalente directo en el otro archivo y se marcaron como no comparables.');
  }

  return narrative.concat(comparison.notes);
}

export function selectBestNumericColumn(dataset: Dataset): string | null {
  const analysis = analyzeDataset(dataset);
  return analysis.numericColumns[0] ?? null;
}

export function selectBestCategoricalColumn(dataset: Dataset): string | null {
  const analysis = analyzeDataset(dataset);
  return analysis.categoricalColumns[0] ?? null;
}

export function selectBestDateColumn(dataset: Dataset): string | null {
  const analysis = analyzeDataset(dataset);
  return analysis.dateColumns[0] ?? null;
}

export function selectBestColumnForTrend(dataset: Dataset): { dateColumn: string | null; valueColumn: string | null } {
  const analysis = analyzeDataset(dataset);
  return {
    dateColumn: analysis.dateColumns[0] ?? null,
    valueColumn: analysis.numericColumns[0] ?? null,
  };
}

export function getAutoChartData(dataset: Dataset) {
  const analysis = analyzeDataset(dataset);
  const categorySummary = analysis.categoryData;
  const trendSummary = analysis.trendData;

  return {
    categorySummary,
    trendSummary,
    preferredChart: trendSummary.length ? 'line' : categorySummary.length ? 'bar' : 'none',
    summary: analysis,
  };
}

export function getAutoInsightSummary(dataset: Dataset) {
  return analyzeDataset(dataset);
}

export function isComparableColumnPair(left: ColumnInsight, right: ColumnInsight): boolean {
  return left.kind === right.kind || (left.kind === 'categorical' && right.kind === 'categorical');
}

export function columnMatchesName(left: string, right: string): boolean {
  return normalizeColumnName(left) === normalizeColumnName(right);
}

export function getColumnSimilarity(left: string, right: string): number {
  const a = normalizeColumnName(left).split(' ');
  const b = normalizeColumnName(right).split(' ');
  const intersection = a.filter((token) => token && b.includes(token));
  const total = new Set([...a, ...b]);
  if (!total.size) return 0;
  return intersection.length / total.size;
}

export function detectColumnKindForValues(values: unknown[]): ColumnKind {
  return detectColumnKind(values);
}

export function getMissingPercent(column: ColumnInsight): number {
  if (!column.total) return 0;
  return (column.missing / column.total) * 100;
}

export function getAutoTopInsights(dataset: Dataset): string[] {
  return analyzeDataset(dataset).conclusions;
}

export function getColumnDisplayName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildDatasetInsightDataset(dataset: Dataset) {
  return analyzeDataset(dataset);
}

export function findFirstMatchingColumn(columnsA: string[], columnsB: string[]): { a: string | null; b: string | null } {
  for (const a of columnsA) {
    const aNorm = normalizeColumnName(a);
    const match = columnsB.find((b) => normalizeColumnName(b) === aNorm || normalizeColumnName(b).includes(aNorm) || aNorm.includes(normalizeColumnName(b)));
    if (match) return { a, b: match };
  }
  return { a: null, b: null };
}

export function getSuggestedAutoPairs(datasetA: Dataset, datasetB: Dataset): Array<{ left: string; right: string }> {
  const analysisA = analyzeDataset(datasetA);
  const analysisB = analyzeDataset(datasetB);
  const pairs: Array<{ left: string; right: string }> = [];

  analysisA.columns.forEach((colA) => {
    const match = analysisB.columns.find((colB) => {
      const sameName = columnMatchesName(colA.name, colB.name);
      const semantic = getColumnSimilarity(colA.name, colB.name) >= 0.35;
      return sameName || (semantic && isComparableColumnPair(colA, colB));
    });

    if (match) {
      pairs.push({ left: colA.name, right: match.name });
    }
  });

  return pairs;
}

export function getDatePatternCandidates() {
  return ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY/MM/DD', 'DD-MM-YYYY'];
}

export function computeAutoSummary(dataset: Dataset) {
  const analysis = analyzeDataset(dataset);
  return {
    rows: analysis.rowCount,
    numerical: analysis.numericColumns.length,
    categorical: analysis.categoricalColumns.length,
    dates: analysis.dateColumns.length,
    alerts: analysis.alerts,
    conclusions: analysis.conclusions,
  };
}

export function getAutoConclusion(dataset: Dataset): string {
  const analysis = analyzeDataset(dataset);
  return analysis.conclusions.join(' ');
}

export function getAutoAlertSummary(dataset: Dataset): string[] {
  return analyzeDataset(dataset).alerts;
}

export function getAutoCategoryData(dataset: Dataset) {
  return analyzeDataset(dataset).categoryData;
}

export function getAutoTrendData(dataset: Dataset) {
  return analyzeDataset(dataset).trendData;
}

export function getAutoMetricCards(dataset: Dataset): ColumnMetric[] {
  return analyzeDataset(dataset).summaryCards;
}

export function getAutoNumericColumns(dataset: Dataset): string[] {
  return analyzeDataset(dataset).numericColumns;
}

export function getAutoDateColumns(dataset: Dataset): string[] {
  return analyzeDataset(dataset).dateColumns;
}

export function getAutoCategoricalColumns(dataset: Dataset): string[] {
  return analyzeDataset(dataset).categoricalColumns;
}

export function getColumnInsightByName(dataset: Dataset, name: string): ColumnInsight | null {
  return analyzeDataset(dataset).columns.find((column) => column.name === name) ?? null;
}

export function getAutoColumnAnalysis(dataset: Dataset) {
  return analyzeDataset(dataset).columns;
}

export function getAutoDatasetInsights(dataset: Dataset) {
  return analyzeDataset(dataset);
}

export function getAutoCompatiblePairs(left: Dataset, right: Dataset): ComparisonResult {
  return findCompatibleColumns(left, right);
}

export function getAutoCompatibleColumns(left: Dataset, right: Dataset) {
  return findCompatibleColumns(left, right).compatiblePairs;
}

export function extractAutoSummaryFromColumns(columns: ColumnInsight[]): string[] {
  return columns.map((column) => {
    if (column.kind === 'numeric' && column.numeric) {
      return `${column.name}: promedio ${column.numeric.mean.toFixed(2)}, mínimo ${column.numeric.min.toFixed(2)}, máximo ${column.numeric.max.toFixed(2)}`;
    }
    if (column.kind === 'date' && column.dateRange) {
      return `${column.name}: rango ${column.dateRange.earliest} a ${column.dateRange.latest}`;
    }
    if (column.kind === 'categorical' && column.categoryTop?.length) {
      return `${column.name}: top ${column.categoryTop[0].label} (${column.categoryTop[0].count})`;
    }
    return `${column.name}: sin resumen automático disponible`;
  });
}

export function inferAutoColumnType(values: unknown[]): ColumnKind {
  return detectColumnKind(values);
}

export function summarizeAutoColumn(dataset: Dataset, columnName: string): string {
  const column = getColumnInsightByName(dataset, columnName);
  if (!column) return 'No disponible';

  if (column.kind === 'numeric' && column.numeric) {
    return `promedio ${column.numeric.mean.toFixed(2)} · mínimo ${column.numeric.min.toFixed(2)} · máximo ${column.numeric.max.toFixed(2)}`;
  }

  if (column.kind === 'date' && column.dateRange) {
    return `rango ${column.dateRange.earliest} a ${column.dateRange.latest}`;
  }

  if (column.kind === 'categorical' && column.categoryTop?.length) {
    return `top ${column.categoryTop[0].label} (${column.categoryTop[0].count})`;
  }

  return 'sin patrón claro';
}

export function getMostRelevantNumericColumn(dataset: Dataset): string | null {
  return getAutoNumericColumns(dataset)[0] ?? null;
}

export function getMostRelevantCategoricalColumn(dataset: Dataset): string | null {
  return getAutoCategoricalColumns(dataset)[0] ?? null;
}

export function getMostRelevantDateColumn(dataset: Dataset): string | null {
  return getAutoDateColumns(dataset)[0] ?? null;
}

export function buildAutoInsightsSummary(dataset: Dataset): string[] {
  const analysis = getAutoDatasetInsights(dataset);
  return [...analysis.conclusions, ...analysis.alerts];
}

export function getAutoColumnCount(dataset: Dataset): number {
  return dataset.columns.length;
}

export function getAutoRowCount(dataset: Dataset): number {
  return dataset.rows.length;
}

export function getAutoNamesFromDataset(dataset: Dataset): string[] {
  return dataset.columns;
}

export function getAutoAlertTexts(dataset: Dataset): string[] {
  return getAutoAlertSummary(dataset);
}
