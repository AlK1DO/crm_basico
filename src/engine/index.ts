/**
 * Engine barrel — re-exporta los módulos del motor analítico central.
 * Los componentes de UI deben importar desde aquí o directamente del módulo.
 */

export { analyzeDataset } from './analysisEngine';
export type { AnalysisFilters } from './analysisEngine';

export { detectColumns, findColumnByType, findAllColumnsByType } from './columnDetector';

export {
  calculateSalesMetrics,
  groupByCategory,
  buildTimeSeries,
  detectTemporalGranularity,
  parseNumeric,
  isMissing,
} from './metricsCalculator';

export {
  compareLastPeriods,
  getAllPeriodComparisons,
  detectOverallTrend,
} from './trendDetector';

export {
  detectSpikesAndDrops,
  detectOutliers,
  detectConcentration,
} from './anomalyDetector';

export {
  buildTrendInsight,
  buildPeriodComparisonInsight,
  buildConcentrationInsight,
  buildAnomalyInsight,
  buildDataQualityInsight,
  sortInsightsByPriority,
  fmtNum,
  nextInsightId,
} from './insightEngine';

export {
  recommendChart,
  CHART_PALETTE,
  CATEGORY_COLORS,
  directionColor,
  formatTooltipValue,
} from './chartSelector';

export {
  cleanDataset,
  DEFAULT_CLEANING_OPTIONS,
} from './dataCleaner';
export type { CleaningOptions as DataCleaningOptions } from './dataCleaner';

export { analyzeOffers } from './offerAnalyzer';
