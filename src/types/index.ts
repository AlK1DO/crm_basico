/**
 * Tipos centralizados del CRM analítico para farmacia.
 * Todos los módulos deben importar desde aquí.
 */

import type { Timestamp } from 'firebase/firestore';

// ─── Roles ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'analyst';

// ─── Permisos ─────────────────────────────────────────────────────────────────

export type ModuleKey =
  | 'dashboard'
  | 'datasets'
  | 'limpieza'
  | 'ventas'
  | 'ofertas'
  | 'reportes'
  | 'administracion';

export interface UserPermissions {
  modules: ModuleKey[];
  datasets: string[]; // IDs de datasets autorizados. Vacío = todos (admin)
}

// ─── Perfil de usuario en Firestore: users/{userId} ──────────────────────────

export interface UserProfile {
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  permissions: UserPermissions;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Código de acceso en Firestore: access_codes/{id} ────────────────────────

export interface AccessCode {
  codeHash: string;
  email: string;
  role: 'analyst';
  permissions: UserPermissions;
  status: 'active' | 'revoked';
  used: boolean;
  createdBy: string;        // UID del admin que lo generó
  createdAt: Timestamp;
  expiresAt: Timestamp;
  usedAt: Timestamp | null;
}

// ─── Dataset ──────────────────────────────────────────────────────────────────

/** Tipos detectados automáticamente por el detector de columnas */
export type ColumnType = 'monetary' | 'quantity' | 'temporal' | 'categorical' | 'identifier' | 'unknown';

export interface ColumnInfo {
  name: string;
  type: ColumnType;
  friendlyName: string;    // nombre amigable para mostrar en UI
  sample: string[];        // muestra de hasta 5 valores
}

export interface DatasetMeta {
  id: string;
  name: string;
  contentHash: string;     // SHA-256 del contenido para deduplicación
  columns: string[];
  columnInfo: ColumnInfo[];
  rowCount: number;
  uploadedAt: Date;
  size: string;
  /** Si true, los datos limpios están disponibles en cleanRows */
  isCleaned: boolean;
}

export interface Dataset extends DatasetMeta {
  rows: Record<string, string>[];
  /** Filas después de ejecutar limpieza. null si no se ha limpiado. */
  cleanRows: Record<string, string>[] | null;
}

// ─── Resultado de limpieza ────────────────────────────────────────────────────

export interface CleaningReport {
  originalRows: number;
  cleanedRows: number;
  duplicatesRemoved: number;
  emptyRowsRemoved: number;
  invalidValuesFixed: number;
  trimmedCells: number;
  dataQualityBefore: number;  // porcentaje 0-100
  dataQualityAfter: number;
  fieldReports: FieldCleaningReport[];
}

export interface FieldCleaningReport {
  column: string;
  type: ColumnType;
  missingCount: number;
  invalidCount: number;
  action: string;
}

// ─── Motor analítico ──────────────────────────────────────────────────────────

export interface SalesMetrics {
  totalAmount: number;
  totalUnits: number;
  avgTicket: number;
  transactionCount: number;
  topProduct: string | null;
  topCategory: string | null;
  currency: string;
}

export interface PeriodComparison {
  periodA: string;
  periodB: string;
  totalA: number;
  totalB: number;
  change: number;        // absoluto
  changePct: number;     // porcentaje
  direction: 'up' | 'down' | 'flat';
}

export interface CategoryBreakdown {
  name: string;
  total: number;
  units: number;
  share: number;         // porcentaje del total
  count: number;
}

export interface TrendPoint {
  label: string;
  value: number;
  movingAvg?: number;
}

export interface Anomaly {
  type: 'spike' | 'drop' | 'gap' | 'outlier';
  label: string;
  value: number;
  expectedRange: [number, number];
  severity: 'low' | 'medium' | 'high';
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export type InsightPriority = 'critical' | 'important' | 'opportunity' | 'informative';
export type InsightType = 'trend' | 'anomaly' | 'concentration' | 'comparison' | 'quality' | 'offer';

export interface Insight {
  id: string;
  type: InsightType;
  priority: InsightPriority;
  title: string;
  fact: string;           // qué ocurrió (dato objetivo)
  evidence: string;       // qué datos lo respaldan
  problem: string | null; // situación negativa/relevante
  suggestion: string;     // acción recomendada
  isHypothesis: boolean;  // true si la causa es inferida, no probada
}

// ─── Resultado completo del motor analítico ───────────────────────────────────

export interface AnalysisResult {
  datasetId: string;
  detectedColumns: {
    monetary: string | null;
    quantity: string | null;
    temporal: string | null;
    product: string | null;
    category: string | null;
  };
  metrics: SalesMetrics | null;
  trends: TrendPoint[];
  categoryBreakdown: CategoryBreakdown[];
  periodComparisons: PeriodComparison[];
  anomalies: Anomaly[];
  insights: Insight[];
  warnings: string[];      // mensajes sobre datos insuficientes
  generatedAt: Date;
}

// ─── Oferta / Promoción ───────────────────────────────────────────────────────

export interface OfferAnalysis {
  hasOfferData: boolean;
  offerColumn: string | null;
  discountColumn: string | null;
  withOffer: { count: number; total: number; avgDiscount: number };
  withoutOffer: { count: number; total: number };
  topPromotedProducts: CategoryBreakdown[];
  lowPerformingOffers: CategoryBreakdown[];
  discountVsQuantity: Array<{ discount: number; quantity: number; product: string }>;
  insights: Insight[];
  warnings: string[];
}

// ─── Auditoría ────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'dataset_uploaded'
  | 'dataset_deleted'
  | 'cleaning_executed'
  | 'analyst_created'
  | 'code_generated'
  | 'code_used'
  | 'permissions_updated'
  | 'access_revoked'
  | 'login_admin'
  | 'login_analyst';

export interface AuditLog {
  action: AuditAction;
  actor: string;           // UID o email del que realizó la acción
  actorRole: UserRole;
  targetUser?: string;     // afectado (si aplica)
  details?: Record<string, unknown>;
  createdAt: Timestamp;
}
